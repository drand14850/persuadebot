-- Turso / libSQL schema. Applied automatically on first use by ensureSchema() in db.ts,
-- so there is no migration step. Every statement is idempotent.
-- Keep semicolons out of comments: the loader splits this file on them.

-- Every save from /admin adds a row. The highest id is the live config, older rows are the
-- version history shown on the admin page.
CREATE TABLE IF NOT EXISTS bot_config (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    saved_at  TEXT NOT NULL,              -- ISO 8601 UTC
    note      TEXT NOT NULL DEFAULT '',   -- optional "what changed" note typed when saving
    config    TEXT NOT NULL               -- JSON, see BotConfig in botConfig.ts
);

-- One row per message. seq is the message's position in the conversation, which is also its
-- identity: every chat request re-sends the whole history and rows are inserted with
-- ON CONFLICT DO NOTHING, so the first write of each position wins and a turn that failed to
-- save is repaired by the next one.
CREATE TABLE IF NOT EXISTS chat_messages (
    conversation_id TEXT NOT NULL,        -- random UUID, one per page load
    seq             INTEGER NOT NULL,     -- 0-based position in the conversation
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL,        -- ISO 8601 UTC, server time of first write
    config_id       INTEGER,              -- bot_config.id in force, NULL if running on defaults
    PRIMARY KEY (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
    ON chat_messages (created_at);
