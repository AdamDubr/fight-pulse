-- Документное хранилище клуба (как в прототипе CRM): коллекция / документ / JSON
CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  seq INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS docs_seq ON docs(seq);
-- Пользователи и роли: owner | admin | trainer
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT,
  added_by TEXT,
  added_at TEXT
);
-- Файлы (фото бойцов, чеки) — метаданные; сами файлы в R2
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  type TEXT,
  size INTEGER,
  by TEXT,
  at TEXT
);
