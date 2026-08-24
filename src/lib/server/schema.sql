-- Turso / libSQL schema for chat message persistence.
-- Apply with: npm run db:migrate
-- Every statement is idempotent, so re-running the migration is safe.
--
-- CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so adding a column
-- here does NOT alter a database that has already been migrated. On an existing database run
-- the ALTER by hand once:
--   ALTER TABLE messages ADD COLUMN app_url TEXT NOT NULL DEFAULT '';
--   ALTER TABLE highlights ADD COLUMN app_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS messages (
    conversation_id TEXT NOT NULL,        -- crypto.randomUUID(), one per page load
    message_id      TEXT NOT NULL,        -- browser-generated id, stable across stream chunks
    response_id     TEXT NOT NULL,        -- Qualtrics ResponseID; the join key to survey data
    app_url         TEXT NOT NULL DEFAULT '',  -- chatParams.appURL_; which deployment produced the row
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,        -- raw text exactly as rendered to the participant
    is_initial      INTEGER NOT NULL DEFAULT 0,  -- 1 = supplied by Qualtrics, not part of the exchange
    created_at      TEXT NOT NULL,        -- message.createdAt, ISO 8601 UTC; also the sort key
    thumb           TEXT,                 -- 'up' | 'down' | NULL, set by the participant
    thumb_at        TEXT,                 -- ISO 8601 UTC, when the rating was given
    PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_response_id
    ON messages (response_id, created_at);

-- Text the participant highlighted, when study.allowTextHighlight is enabled.
-- Conversation-level: the app records the selected strings without linking them to a
-- specific message, so they cannot live in the messages table.
CREATE TABLE IF NOT EXISTS highlights (
    conversation_id TEXT NOT NULL,
    response_id     TEXT NOT NULL,
    app_url         TEXT NOT NULL DEFAULT '',
    text            TEXT NOT NULL,
    saved_at        TEXT NOT NULL,        -- ISO 8601 UTC, when this row was last written
    PRIMARY KEY (conversation_id, text)
);

CREATE INDEX IF NOT EXISTS idx_highlights_response_id
    ON highlights (response_id);
