// '/web' entry, not the default: the default one does `import Database from "libsql"` at the
// top of sqlite3.js, which loads a native .node binding. That binding isn't in the Vercel
// bundle, so importing it crashed the whole function on boot. Turso is remote, so the
// fetch-based web client does everything we need (execute + batch over HTTP).
import { createClient } from '@libsql/client/web';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import schemaSql from './schema.sql?raw';
import { DEFAULT_CONFIG, parseStoredConfig, type BotConfig } from './botConfig';

// Read through $env/dynamic/private so Vercel environment variables resolve at runtime.
// Static imports would require the values to exist at build time.

type Value = string | number | null;
type Row = Record<string, unknown>;

interface Statement {
	sql: string;
	args?: Value[];
}

interface Db {
	execute(sql: string, args?: Value[]): Promise<Row[]>;
	// Runs all statements in one transaction: either all of them land or none do.
	batch(statements: Statement[]): Promise<void>;
}

// 'remote' = Turso. 'local' = a SQLite file for `npm run dev` without a Turso account.
// 'none' = production with no database: the bot runs on DEFAULT_CONFIG, nothing is saved,
// and /admin says so instead of pretending saves work.
export type DbMode = 'remote' | 'local' | 'none';

export function dbMode(): DbMode {
	if (env.TURSO_DATABASE_URL) return 'remote';
	if (dev) return 'local';
	return 'none';
}

const LOCAL_DB_FILE = 'local.db';

function createRemoteDb(url: string, authToken: string | undefined): Db {
	const client = createClient({ url, authToken });
	return {
		async execute(sql, args = []) {
			const result = await client.execute({ sql, args });
			return result.rows as unknown as Row[];
		},
		async batch(statements) {
			await client.batch(
				statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
				'write'
			);
		}
	};
}

interface LocalSqlite {
	exec(sql: string): void;
	prepare(sql: string): { all(...args: Value[]): Row[]; run(...args: Value[]): unknown };
}

// Dev only: dbMode() returns 'local' only under `vite dev`, so production never gets here.
// node:sqlite ships with Node 22.13+, so local development needs no extra package.
async function createLocalDb(): Promise<Db> {
	const moduleName = 'node:sqlite';
	const { DatabaseSync } = (await import(/* @vite-ignore */ moduleName)) as {
		DatabaseSync: new (path: string) => LocalSqlite;
	};
	const db = new DatabaseSync(LOCAL_DB_FILE);
	return {
		async execute(sql, args = []) {
			return db.prepare(sql).all(...args);
		},
		async batch(statements) {
			db.exec('BEGIN');
			try {
				for (const s of statements) db.prepare(s.sql).run(...(s.args ?? []));
				db.exec('COMMIT');
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		}
	};
}

function schemaStatements(): string[] {
	return schemaSql
		.replace(/--.*$/gm, '')
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean);
}

let dbPromise: Promise<Db> | null = null;

// Created lazily and cached at module scope: on Vercel the module survives between warm
// invocations, so the connection and the schema check happen once per instance.
function getDb(): Promise<Db> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const mode = dbMode();
			if (mode === 'none') throw new Error('No database configured (TURSO_DATABASE_URL is not set).');
			const db =
				mode === 'remote'
					? createRemoteDb(env.TURSO_DATABASE_URL!, env.TURSO_AUTH_TOKEN)
					: await createLocalDb();
			await db.batch(schemaStatements().map((sql) => ({ sql })));
			return db;
		})();
		// A failed connection must not be cached forever; the next request retries.
		dbPromise.catch(() => {
			dbPromise = null;
		});
	}
	return dbPromise;
}

// ---------------------------------------------------------------------------------------------
// Bot config
// ---------------------------------------------------------------------------------------------

export interface LoadedConfig {
	id: number | null; // null = running on DEFAULT_CONFIG, nothing saved yet
	savedAt: string | null;
	config: BotConfig;
}

// Throws when a database is configured but unreachable. Callers must not fall back to the
// defaults in that case: silently swapping the designer's prompt for the placeholder one
// would be worse than a visible error.
export async function getCurrentConfig(): Promise<LoadedConfig> {
	if (dbMode() === 'none') return { id: null, savedAt: null, config: DEFAULT_CONFIG };

	const db = await getDb();
	const rows = await db.execute('SELECT id, saved_at, config FROM bot_config ORDER BY id DESC LIMIT 1');
	if (rows.length === 0) return { id: null, savedAt: null, config: DEFAULT_CONFIG };

	return {
		id: Number(rows[0].id),
		savedAt: String(rows[0].saved_at),
		config: parseStoredConfig(String(rows[0].config))
	};
}

export async function saveConfig(config: BotConfig, note: string): Promise<number> {
	const db = await getDb();
	const rows = await db.execute(
		'INSERT INTO bot_config (saved_at, note, config) VALUES (?, ?, ?) RETURNING id',
		[new Date().toISOString(), note, JSON.stringify(config)]
	);
	return Number(rows[0].id);
}

export interface ConfigVersion {
	id: number;
	savedAt: string;
	note: string;
	config: BotConfig;
}

function toConfigVersion(row: Row): ConfigVersion {
	return {
		id: Number(row.id),
		savedAt: String(row.saved_at),
		note: String(row.note),
		config: parseStoredConfig(String(row.config))
	};
}

export async function listConfigVersions(limit: number): Promise<ConfigVersion[]> {
	const db = await getDb();
	const rows = await db.execute(
		'SELECT id, saved_at, note, config FROM bot_config ORDER BY id DESC LIMIT ?',
		[limit]
	);
	return rows.map(toConfigVersion);
}

export async function getConfigVersions(ids: number[]): Promise<ConfigVersion[]> {
	if (ids.length === 0) return [];
	const db = await getDb();
	const rows = await db.execute(
		`SELECT id, saved_at, note, config FROM bot_config
		  WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id`,
		ids
	);
	return rows.map(toConfigVersion);
}

export async function listAllConfigVersions(): Promise<ConfigVersion[]> {
	const db = await getDb();
	const rows = await db.execute('SELECT id, saved_at, note, config FROM bot_config ORDER BY id');
	return rows.map(toConfigVersion);
}

// ---------------------------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------------------------

export interface TurnMessage {
	role: 'user' | 'assistant';
	content: string;
}

const INSERT_MESSAGE = `INSERT INTO chat_messages (conversation_id, seq, role, content, created_at, config_id)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (conversation_id, seq) DO NOTHING`;

// Called when a chat request arrives, before the model is, with the full history ending in the
// visitor's new message. See the chat_messages comment in schema.sql for why re-sending
// history is safe.
export async function saveHistory(
	conversationId: string,
	history: TurnMessage[],
	configId: number | null
): Promise<void> {
	if (dbMode() === 'none') return;

	const db = await getDb();
	const now = new Date().toISOString();
	await db.batch(
		history.map((message, seq) => ({
			sql: INSERT_MESSAGE,
			args: [conversationId, seq, message.role, message.content, now, configId]
		}))
	);
}

// Called when the model's reply ends (or stops early). seq is the reply's position, i.e. the
// length of the history saved by saveHistory.
export async function saveReply(
	conversationId: string,
	seq: number,
	content: string,
	configId: number | null
): Promise<void> {
	if (dbMode() === 'none') return;

	const db = await getDb();
	await db.execute(INSERT_MESSAGE, [
		conversationId,
		seq,
		'assistant',
		content,
		new Date().toISOString(),
		configId
	]);
}

export interface ConversationSummary {
	id: string;
	startedAt: string;
	lastAt: string;
	userMessages: number;
	firstConfigId: number | null;
	lastConfigId: number | null;
	preview: string;
}

export async function countConversations(): Promise<number> {
	const db = await getDb();
	const rows = await db.execute('SELECT COUNT(DISTINCT conversation_id) AS n FROM chat_messages');
	return Number(rows[0]?.n ?? 0);
}

export async function listConversations(limit: number, offset: number): Promise<ConversationSummary[]> {
	const db = await getDb();
	const rows = await db.execute(
		`SELECT conversation_id,
		        MIN(created_at) AS started_at,
		        MAX(created_at) AS last_at,
		        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS user_messages,
		        MIN(config_id) AS first_config_id,
		        MAX(config_id) AS last_config_id,
		        (SELECT substr(f.content, 1, 200) FROM chat_messages f
		          WHERE f.conversation_id = m.conversation_id AND f.role = 'user'
		          ORDER BY f.seq LIMIT 1) AS preview
		   FROM chat_messages m
		  GROUP BY conversation_id
		  ORDER BY last_at DESC
		  LIMIT ? OFFSET ?`,
		[limit, offset]
	);
	return rows.map((row) => ({
		id: String(row.conversation_id),
		startedAt: String(row.started_at),
		lastAt: String(row.last_at),
		userMessages: Number(row.user_messages),
		firstConfigId: row.first_config_id === null ? null : Number(row.first_config_id),
		lastConfigId: row.last_config_id === null ? null : Number(row.last_config_id),
		preview: String(row.preview ?? '')
	}));
}

export interface StoredMessage {
	conversationId: string;
	seq: number;
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
	configId: number | null;
}

function toStoredMessage(row: Row): StoredMessage {
	return {
		conversationId: String(row.conversation_id),
		seq: Number(row.seq),
		role: row.role as 'user' | 'assistant',
		content: String(row.content),
		createdAt: String(row.created_at),
		configId: row.config_id === null ? null : Number(row.config_id)
	};
}

export async function getConversation(conversationId: string): Promise<StoredMessage[]> {
	const db = await getDb();
	const rows = await db.execute(
		`SELECT conversation_id, seq, role, content, created_at, config_id
		   FROM chat_messages WHERE conversation_id = ? ORDER BY seq`,
		[conversationId]
	);
	return rows.map(toStoredMessage);
}

// Conversations in the order they started, messages in order within each.
export async function exportAllMessages(): Promise<StoredMessage[]> {
	const db = await getDb();
	const rows = await db.execute(
		`SELECT m.conversation_id, m.seq, m.role, m.content, m.created_at, m.config_id
		   FROM chat_messages m
		   JOIN (SELECT conversation_id, MIN(created_at) AS started_at
		           FROM chat_messages GROUP BY conversation_id) s
		     ON s.conversation_id = m.conversation_id
		  ORDER BY s.started_at, m.conversation_id, m.seq`
	);
	return rows.map(toStoredMessage);
}
