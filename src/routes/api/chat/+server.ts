import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { getCurrentConfig, saveHistory, saveReply, type TurnMessage } from '$lib/server/db';
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	type AIMessageChunk,
	type BaseMessage
} from '@langchain/core/messages';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createChatModel } from './providers';

// This endpoint is public and every call is paid for, so a request is bounded here no matter
// what the admin settings say. The real spending cap is the credit limit on the OpenRouter key.
const MAX_BODY_CHARS = 1_000_000;
const MAX_USER_MESSAGE_CHARS = 6_000; // the input box allows 4000; sanitising can lengthen it
const MAX_ASSISTANT_MESSAGE_CHARS = 50_000; // above the longest reply maxTokens allows
const MAX_HISTORY_MESSAGES = 500;
// Only the most recent messages that fit this budget are sent to the model (~30k tokens), so
// a long conversation keeps working instead of overflowing the model's context window.
const MAX_MODEL_INPUT_CHARS = 120_000;
const SAVE_TIMEOUT_MS = 5_000;

// Some providers reject a conversation whose first turn is the assistant's, which is what a
// greeting produces. This stands in for the visitor's arrival so the greeting has something
// to follow.
const OPENING_USER_TURN = '(The visitor has opened the chat.)';
const CUT_OFF_NOTE = '\n\n_(The reply was cut off. Please try again.)_';

const MessageSchema = z.discriminatedUnion('role', [
	z.object({ role: z.literal('user'), content: z.string().max(MAX_USER_MESSAGE_CHARS) }),
	z.object({ role: z.literal('assistant'), content: z.string().max(MAX_ASSISTANT_MESSAGE_CHARS) })
]);

// Deliberately has no prompt, model or key fields: the browser only supplies the conversation.
const ChatRequestSchema = z.object({
	conversationId: z.string().uuid(),
	messages: z.array(MessageSchema).min(1).max(MAX_HISTORY_MESSAGES)
});

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
	const raw = await request.text();
	if (raw.length > MAX_BODY_CHARS) {
		return new Response('Payload too large', { status: 413 });
	}

	let parsed;
	try {
		parsed = ChatRequestSchema.safeParse(JSON.parse(raw));
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}
	if (!parsed.success) {
		logger.warn(`Rejected chat request: ${parsed.error.issues[0]?.message}`);
		return new Response('Invalid request', { status: 400 });
	}

	const { conversationId, messages } = parsed.data;
	const last = messages[messages.length - 1];
	if (last.role !== 'user' || last.content.trim() === '') {
		return new Response('The last message must be a non-empty visitor message', { status: 400 });
	}

	let loaded;
	try {
		loaded = await getCurrentConfig();
	} catch (error) {
		// Fail closed: answering with the default prompt would quietly run the wrong bot.
		logger.error(error, 'Could not load bot config from the database:');
		return new Response('Chat is temporarily unavailable', { status: 503 });
	}
	const { config, id: configId } = loaded;

	const userMessageCount = messages.filter((m) => m.role === 'user').length;
	if (config.maxUserMessages > 0 && userMessageCount > config.maxUserMessages) {
		return Response.json({ error: 'limit' }, { status: 429 });
	}

	// Saved before the model is called, so the visitor's message is on record even if the model
	// fails or the server is shut down mid-reply (e.g. because the visitor closed the page).
	await saveSafely(() => saveHistory(conversationId, messages, configId));

	if (!env.OPENROUTER_API_KEY) {
		logger.error('OPENROUTER_API_KEY is not set.');
		return new Response('Chat is not configured', { status: 503 });
	}

	const abort = new AbortController();
	let iterator: AsyncIterator<AIMessageChunk>;
	let firstText = '';
	let finished = false;

	// Wait for the first piece of text before answering, so the common failures (bad key,
	// unknown model, no credit) become an error status the page can show, not an empty reply.
	try {
		const stream = await createChatModel(config).stream(toModelMessages(config.systemPrompt, messages), {
			signal: abort.signal
		});
		iterator = stream[Symbol.asyncIterator]();
		while (firstText === '') {
			const result = await iterator.next();
			if (result.done) {
				finished = true;
				break;
			}
			firstText = chunkText(result.value);
		}
	} catch (error) {
		logger.error(error, `Model request failed (model: ${config.model}):`);
		return new Response('Model request failed', { status: 502 });
	}

	if (firstText === '') {
		logger.error(`Model returned an empty reply (model: ${config.model}).`);
		return new Response('Model returned an empty reply', { status: 502 });
	}

	const encoder = new TextEncoder();
	let open = true;

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (text: string) => {
				if (!open || text === '') return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					open = false;
				}
			};

			let reply = firstText;
			send(firstText);
			try {
				while (!finished && open) {
					const result = await iterator.next();
					if (result.done) break;
					const text = chunkText(result.value);
					reply += text;
					send(text);
				}
			} catch (error) {
				if (!abort.signal.aborted) {
					logger.error(error, `Model stream failed partway (model: ${config.model}):`);
					send(CUT_OFF_NOTE);
				}
			}

			// Also reached when the visitor leaves mid-reply, so a partial reply is saved as far as
			// it got. Saved before closing so the write finishes while the function is still
			// running; the visitor already has the text, so this only delays re-enabling the input.
			await saveSafely(() => saveReply(conversationId, messages.length, reply, configId));
			if (open) {
				try {
					controller.close();
				} catch {
					// already closed by the visitor
				}
			}
		},
		cancel() {
			// The visitor left mid-reply: stop generating tokens nobody will read.
			open = false;
			abort.abort();
		}
	});

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};

function toModelMessages(systemPrompt: string, messages: TurnMessage[]): BaseMessage[] {
	const recent = keepMostRecent(messages, MAX_MODEL_INPUT_CHARS);
	const modelMessages: BaseMessage[] = [];

	if (systemPrompt.trim() !== '') {
		modelMessages.push(new SystemMessage(systemPrompt));
	}
	if (recent[0]?.role === 'assistant') {
		modelMessages.push(new HumanMessage(OPENING_USER_TURN));
	}
	for (const message of recent) {
		modelMessages.push(
			message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content)
		);
	}
	return modelMessages;
}

// Keeps the newest messages whose combined length fits the budget. The last message (the
// visitor's new one) is always kept.
function keepMostRecent(messages: TurnMessage[], budgetChars: number): TurnMessage[] {
	let used = 0;
	let start = messages.length;
	while (start > 0) {
		const length = messages[start - 1].content.length;
		if (start < messages.length && used + length > budgetChars) break;
		used += length;
		start--;
	}
	return messages.slice(start);
}

function chunkText(chunk: AIMessageChunk): string {
	if (typeof chunk.content === 'string') return chunk.content;
	return chunk.content.map((part) => (part.type === 'text' ? (part as { text: string }).text : '')).join('');
}

// Saving a transcript must never break or noticeably stall the chat.
async function saveSafely(save: () => Promise<void>): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			save(),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error('timed out')), SAVE_TIMEOUT_MS);
			})
		]);
	} catch (error) {
		logger.error(error, 'Failed to save transcript:');
	} finally {
		clearTimeout(timer);
	}
}
