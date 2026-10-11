import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'medha.db';

let db: SQLiteDatabase | null = null;
let initialized = false;
let messageSearchIndexAvailable = false;

function openDatabase(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync(DB_NAME);
  return db;
}

export function getDatabase(): SQLiteDatabase {
  const database = openDatabase();
  if (!initialized) {
    initializeDatabase();
  }
  return database;
}

export function initializeDatabase(): void {
  if (initialized) return;

  const database = openDatabase();

  // Enable foreign keys
  database.runSync('PRAGMA foreign_keys = ON');

  // Create conversations table
  database.runSync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT,
      provider TEXT DEFAULT 'openrouter',
      system_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned INTEGER DEFAULT 0
    )
  `);

  // Create messages table
  database.runSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'complete',
      model TEXT,
      tokens_used INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  database.runSync('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)');
  database.runSync('CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)');

  // Migrations
  // Add reasoning column (Sprint 4)
  try {
    database.runSync('ALTER TABLE messages ADD COLUMN reasoning TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Add attachments column (Sprint 9)
  try {
    database.runSync('ALTER TABLE messages ADD COLUMN attachments TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Add thinking_mode column to conversations (Sprint 10)
  try {
    database.runSync('ALTER TABLE conversations ADD COLUMN thinking_mode TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Add tool_call_id column to messages (Sprint 12)
  try {
    database.runSync('ALTER TABLE messages ADD COLUMN tool_call_id TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Add tool_calls column to messages (Sprint 12 — stores assistant's tool call requests)
  try {
    database.runSync('ALTER TABLE messages ADD COLUMN tool_calls TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Add rules column to conversations (Sprint 13)
  try {
    database.runSync('ALTER TABLE conversations ADD COLUMN rules TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Create memories table (Sprint 14)
  database.runSync(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      source TEXT,
      hit_count INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  database.runSync('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)');
  database.runSync('CREATE INDEX IF NOT EXISTS idx_memories_hits ON memories(hit_count DESC)');

  // Memory provenance + real usage tracking
  try {
    database.runSync('ALTER TABLE memories ADD COLUMN conversation_id TEXT');
  } catch {
    // Column already exists — ignore
  }
  try {
    database.runSync('ALTER TABLE memories ADD COLUMN last_used_at INTEGER');
  } catch {
    // Column already exists — ignore
  }

  // Memory changes made automatically after a reply, so they can be shown and undone per message
  database.runSync(`
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      op TEXT NOT NULL,
      before_json TEXT,
      after_content TEXT,
      undone_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `);
  database.runSync('CREATE INDEX IF NOT EXISTS idx_memory_events_conv ON memory_events(conversation_id)');

  // Create token_usage table (Sprint 18)
  database.runSync(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      cost_usd REAL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `);
  database.runSync('CREATE INDEX IF NOT EXISTS idx_token_usage_conv ON token_usage(conversation_id)');
  database.runSync('CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(created_at)');

  // Create skills table (Sprint 19)
  database.runSync(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'created',
      storage_path TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      trusted INTEGER DEFAULT 0,
      has_scripts INTEGER DEFAULT 0,
      has_references INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  database.runSync('CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name)');

  // Add active_skill_name column to conversations (Sprint 19)
  try {
    database.runSync('ALTER TABLE conversations ADD COLUMN active_skill_name TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Create apps table (Sprint 20)
  database.runSync(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'Bot',
      color TEXT,
      skill_name TEXT,
      model TEXT,
      provider TEXT,
      rules TEXT,
      greeting TEXT,
      example_prompts TEXT,
      builtin INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Add app_id column to conversations (Sprint 20)
  try {
    database.runSync('ALTER TABLE conversations ADD COLUMN app_id TEXT');
  } catch {
    // Column already exists — ignore
  }

  messageSearchIndexAvailable = ensureMessageSearchIndex(database);

  initialized = true;
}

/** Whether the FTS5 index over chat messages exists (false if the SQLite build lacks FTS5). */
export function isMessageSearchIndexAvailable(): boolean {
  getDatabase();
  return messageSearchIndexAvailable;
}

/**
 * Full-text index over user/assistant messages, kept in sync by triggers.
 * Rows share the message's rowid for cheap deletes, and also store the message
 * id so lookups join on the real key. INSERT OR REPLACE keeps a rowid collision
 * from ever failing a message write.
 */
function ensureMessageSearchIndex(database: SQLiteDatabase): boolean {
  try {
    const existing = database.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'"
    );
    if (existing) return true;

    database.withTransactionSync(() => {
      database.runSync(
        "CREATE VIRTUAL TABLE messages_fts USING fts5(content, message_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2')"
      );
      database.runSync(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
        WHEN new.role IN ('user', 'assistant')
        BEGIN
          INSERT OR REPLACE INTO messages_fts (rowid, content, message_id) VALUES (new.rowid, new.content, new.id);
        END
      `);
      database.runSync(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
        BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid AND message_id = old.id;
        END
      `);
      database.runSync(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF content ON messages
        WHEN new.role IN ('user', 'assistant')
        BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid AND message_id = old.id;
          INSERT OR REPLACE INTO messages_fts (rowid, content, message_id) VALUES (new.rowid, new.content, new.id);
        END
      `);
      database.runSync(`
        INSERT INTO messages_fts (rowid, content, message_id)
        SELECT rowid, content, id FROM messages
        WHERE role IN ('user', 'assistant') AND LENGTH(TRIM(content)) > 0
      `);
    });
    return true;
  } catch {
    // SQLite built without FTS5 — chat search falls back to LIKE.
    return false;
  }
}
