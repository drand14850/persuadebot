import { csvResponse, toCsv } from '$lib/server/csv';
import { exportAllMessages } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Admin only: hooks.server.ts rejects requests without a session before this runs.
export const GET: RequestHandler = async () => {
	const messages = await exportAllMessages();
	const csv = toCsv(
		['conversation_id', 'seq', 'role', 'created_at_utc', 'prompt_version', 'content'],
		messages.map((m) => [m.conversationId, m.seq, m.role, m.createdAt, m.configId, m.content])
	);
	return csvResponse(`transcripts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
};
