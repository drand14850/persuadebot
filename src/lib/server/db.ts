// '/web' entry, not the default: the default one does `import Database from "libsql"` at the
// top of sqlite3.js, which loads a native .node binding. That binding isn't in the Vercel
// bundle, so importing it crashed the whole function on boot. Turso is remote, so the
// fetch-based web client does everything we need (execute + batch over HTTP).
import { createClient, type Client, type InStatement } from '@libsql/client/web';
import { env } from '$env/dynamic/private';

// Read through $env/dynamic/private so Vercel environment variables resolve at runtime.
// Static imports would require the values to exist at build time.

export interface MessageRow {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	isInitial?: boolean;
	createdAt: string;
	thumb?: string;
	thumbAt?: string;
}

export interface ConversationPayload {
	conversationId: string;
	responseId: string;
	appUrl: string;
	messages: MessageRow[];
	highlights: string[];
}

let client: Client | null = null;

// Created lazily and cached at module scope: on Vercel the module survives between warm
// invocations, so one connection is reused instead of one per request.
function getClient(): Client {
	if (client) return client;

	const url = env.TURSO_DATABASE_URL;
	if (!url) {
		throw new Error('TURSO_DATABASE_URL is not set');
	}
	client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN });
	return client;
}

// Upserts the whole conversation. Idempotent on (conversation_id, message_id), which is what
// lets every save be a full sync: a request lost at one turn is repaired by the next one.
export async function saveConversation(payload: ConversationPayload): Promise<void> {
	const savedAt = new Date().toISOString();

	const statements: InStatement[] = payload.messages.map((message) => ({
		sql: `INSERT INTO messages (
                  conversation_id, message_id, response_id, app_url, role, content,
                  is_initial, created_at, thumb, thumb_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (conversation_id, message_id) DO UPDATE SET
                  content  = excluded.content,
                  app_url  = excluded.app_url,
                  thumb    = excluded.thumb,
                  thumb_at = excluded.thumb_at`,
		args: [
			payload.conversationId,
			message.id,
			payload.responseId,
			payload.appUrl,
			message.role,
			message.content,
			message.isInitial ? 1 : 0,
			message.createdAt,
			message.thumb ?? null,
			message.thumbAt ?? null
		]
	}));

	// Highlights are replaced rather than upserted, because a participant can un-highlight
	// text. Deleting first makes each sync authoritative about what is currently highlighted.
	statements.push({
		sql: 'DELETE FROM highlights WHERE conversation_id = ?',
		args: [payload.conversationId]
	});
	for (const text of payload.highlights) {
		statements.push({
			sql: `INSERT INTO highlights (conversation_id, response_id, app_url, text, saved_at)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT (conversation_id, text) DO NOTHING`,
			args: [payload.conversationId, payload.responseId, payload.appUrl, text, savedAt]
		});
	}

	// One batch = one transaction = one round trip. Either the whole sync lands or none of it.
	await getClient().batch(statements, 'write');
}

// Rows are deleted this many days after the message was created. SQLite has no row expiry,
// so a scheduled job has to do it — see /api/db/cleanup and the cron entry in vercel.json.
export const RETENTION_DAYS = 180;

export interface PruneResult {
	cutoff: string;
	messages: number;
	highlights: number;
	dryRun: boolean;
}

// Deletes messages older than the retention window, then any highlights left orphaned.
// Pass dryRun to count what WOULD be deleted without touching anything.
export async function pruneOldRows(dryRun = false): Promise<PruneResult> {
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const db = getClient();

	// Counting first makes the result reportable and gives dry runs something to return.
	const messageCount = await db.execute({
		sql: 'SELECT COUNT(*) AS n FROM messages WHERE created_at < ?',
		args: [cutoff]
	});
	const highlightCount = await db.execute({
		sql: `SELECT COUNT(*) AS n FROM highlights
              WHERE conversation_id NOT IN (
                  SELECT conversation_id FROM messages WHERE created_at >= ?
              )`,
		args: [cutoff]
	});

	const messages = Number(messageCount.rows[0]?.n ?? 0);
	const highlights = Number(highlightCount.rows[0]?.n ?? 0);

	if (!dryRun && (messages > 0 || highlights > 0)) {
		await db.batch(
			[
				{ sql: 'DELETE FROM messages WHERE created_at < ?', args: [cutoff] },
				// Keyed off what survives rather than off highlight timestamps, so a highlight
				// can never outlive the conversation it belongs to.
				{
					sql: `DELETE FROM highlights WHERE conversation_id NOT IN (
                              SELECT conversation_id FROM messages
                          )`,
					args: []
				}
			],
			'write'
		);
	}

	return { cutoff, messages, highlights, dryRun };
}
