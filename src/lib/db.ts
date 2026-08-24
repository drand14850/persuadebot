// Client side of message persistence.
//
// Every save posts the WHOLE current message array and the server upserts by message id.
// That makes each call a full sync: a request lost at one turn is repaired by the next one,
// so no retry queue or offline buffer is needed.
//
// Persistence is off unless chatParams.study.ResponseID is truthy. Without a Qualtrics
// identifier a transcript cannot be joined to survey data, so it is noise rather than data.

import { get, writable, type Writable } from 'svelte/store';
import { chatParams, type ChatMessageType } from './chatParams';
import { messages } from './messages';
import { highlightedStrings } from './stores';

const ENDPOINT = '/api/db/messages';

// Browsers cap keepalive request bodies at 64 KiB. Below this we use keepalive so a save
// fired just before Qualtrics navigates the parent page still completes; above it we fall
// back to a normal request rather than having the browser reject the send outright.
const KEEPALIVE_MAX_BYTES = 60_000;

// One id per page load. A reload starts a new conversation; runs are grouped by ResponseID.
export const conversationId: Writable<string> = writable('');

let warnedAboutResponseId = false;
let warnedAboutUuid = false;

export function initConversationId(): void {
	if (get(conversationId)) return;
	try {
		conversationId.set(crypto.randomUUID());
	} catch {
		// Only reachable outside a secure context, where persistence simply stays off.
		if (!warnedAboutUuid) {
			console.error('crypto.randomUUID unavailable; database persistence disabled.');
			warnedAboutUuid = true;
		}
	}
}

function getResponseId(): string {
	return get(chatParams).study.ResponseID ?? '';
}

export function isPersistenceEnabled(): boolean {
	const responseId = getResponseId();
	if (!responseId) return false;

	// A misconfigured survey sends the literal "${e://Field/ResponseID}" instead of a value.
	// It is truthy, so without this check every row would key on a useless placeholder and
	// the failure would stay silent until analysis time.
	if (responseId.includes('${')) {
		if (!warnedAboutResponseId) {
			console.error(
				`Database persistence disabled: study.ResponseID looks like an unpiped Qualtrics field ("${responseId}").`
			);
			warnedAboutResponseId = true;
		}
		return false;
	}
	return Boolean(get(conversationId));
}

function toIsoString(value: Date | string | undefined): string | undefined {
	if (!value) return undefined;
	if (value instanceof Date) return value.toISOString();
	const parsed = new Date(value);
	return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toPayloadMessage(message: ChatMessageType) {
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		isInitial: message.isInitial === true,
		createdAt: toIsoString(message.createdAt) ?? new Date().toISOString(),
		thumb: message.thumb,
		thumbAt: toIsoString(message.thumbAt)
	};
}

// Fire and forget. Callers must not await this: a slow or broken database must never delay
// or break the chat. Failures are logged to the console and otherwise ignored.
export async function syncConversation(): Promise<void> {
	if (!isPersistenceEnabled()) return;

	// Skip messages without an id (the empty assistant placeholder used to trigger the
	// loading avatar) — they carry no content and get a real id on the first stream chunk.
	const payloadMessages = get(messages)
		.filter((message) => message.id && message.content !== undefined)
		.map(toPayloadMessage);

	if (payloadMessages.length === 0) return;

	const body = JSON.stringify({
		conversationId: get(conversationId),
		responseId: getResponseId(),
		// Supplied by Qualtrics, not read from the browser, so it records which deployment the
		// survey believes it embedded. Empty when a survey omits it; rows still save.
		appUrl: get(chatParams).appURL_ ?? '',
		messages: payloadMessages,
		highlights: get(highlightedStrings)
	});

	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			keepalive: new TextEncoder().encode(body).length < KEEPALIVE_MAX_BYTES
		});
		if (!response.ok) {
			console.error(`Failed to save messages to database (${response.status}).`);
		}
	} catch (error) {
		console.error('Failed to save messages to database.', error);
	}
}
