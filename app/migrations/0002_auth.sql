-- Собственный вход PIT: коды на e-mail и сессии
CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  exp INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 1,
  window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,          -- SHA-256 от токена из cookie
  email TEXT NOT NULL,
  created INTEGER NOT NULL,
  last INTEGER NOT NULL,
  exp INTEGER NOT NULL,
  ua TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);
CREATE TABLE IF NOT EXISTS ip_limits (
  ip TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS logins (
  at INTEGER NOT NULL,
  email TEXT NOT NULL,
  event TEXT NOT NULL,
  ip TEXT,
  ua TEXT
);
