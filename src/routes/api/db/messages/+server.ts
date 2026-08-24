import { logger } from '$lib/logger';
import { saveConversation } from '$lib/server/db';
import { z } from 'zod';
import type { RequestHandler } from './$types';

// Write-only endpoint. It is publicly reachable, so every field is validated and capped.
const MAX_BODY_BYTES = 1_000_000;
const MAX_MESSAGES = 500;
const MAX_CONTENT_CHARS = 100_000;

const MessageSchema = z.object({
	id: z.string().min(1).max(200),
	role: z.enum(['user', 'assistant', 'system']),
	content: z.string().max(MAX_CONTENT_CHARS),
	isInitial: z.boolean().optional(),
	createdAt: z.string().min(1).max(50),
	thumb: z.string().max(20).optional(),
	thumbAt: z.string().max(50).optional()
});

const PayloadSchema = z.object({
	conversationId: z.string().uuid(),
	// A non-empty responseId is the activation gate: no Qualtrics identifier, no row.
	// Also the primary spam guard, since the endpoint is unauthenticated.
	responseId: z.string().min(1).max(200),
	// Optional: a survey that omits it still saves, with the column left empty.
	appUrl: z.string().max(500).default(''),
	messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
	highlights: z.array(z.string().max(10_000)).max(500).default([])
});

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
	let raw: string;
	try {
		raw = await request.text();
	} catch {
		return new Response('Invalid request', { status: 400 });
	}

	if (raw.length > MAX_BODY_BYTES) {
		logger.warn(`Rejected oversized message payload: ${raw.length} bytes`);
		return new Response('Payload too large', { status: 413 });
	}

	let parsed;
	try {
		parsed = PayloadSchema.safeParse(JSON.parse(raw));
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}

	if (!parsed.success) {
		logger.warn(`Rejected message payload: ${parsed.error.issues[0]?.message}`);
		return new Response('Invalid request', { status: 400 });
	}

	try {
		await saveConversation(parsed.data);
	} catch (error) {
		// The client ignores this status; the chat must keep working regardless.
		logger.error(error, 'Failed to save conversation:');
		return new Response('Database error', { status: 500 });
	}

	return new Response(null, { status: 204 });
};
