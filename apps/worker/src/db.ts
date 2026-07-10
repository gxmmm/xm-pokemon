import type { D1Database } from '@cloudflare/workers-types';

export interface PlayerRow {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  token: string | null;
  created_at: number;
}

export interface SaveRow {
  player_id: string;
  data: string;
  updated_at: number;
}

export async function getPlayerByUsername(db: D1Database, username: string): Promise<PlayerRow | null> {
  return (await db.prepare('SELECT * FROM players WHERE username = ? COLLATE NOCASE').bind(username).first<PlayerRow>()) ?? null;
}

export async function getPlayerById(db: D1Database, id: string): Promise<PlayerRow | null> {
  return (await db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerRow>()) ?? null;
}

export async function getPlayerByToken(db: D1Database, token: string): Promise<PlayerRow | null> {
  if (!token) return null;
  return (await db.prepare('SELECT * FROM players WHERE token = ?').bind(token).first<PlayerRow>()) ?? null;
}

export async function createPlayer(db: D1Database, row: PlayerRow): Promise<void> {
  await db.prepare('INSERT INTO players (id, username, password_hash, salt, token, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.username, row.password_hash, row.salt, row.token, row.created_at).run();
}

export async function setToken(db: D1Database, id: string, token: string): Promise<void> {
  await db.prepare('UPDATE players SET token = ? WHERE id = ?').bind(token, id).run();
}

export async function getSave(db: D1Database, playerId: string): Promise<SaveRow | null> {
  return (await db.prepare('SELECT * FROM saves WHERE player_id = ?').bind(playerId).first<SaveRow>()) ?? null;
}

export async function upsertSave(db: D1Database, playerId: string, data: string, updatedAt: number): Promise<void> {
  await db.prepare(
    'INSERT INTO saves (player_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ).bind(playerId, data, updatedAt).run();
}

export async function addFriend(db: D1Database, playerId: string, friendUsername: string): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO friends (player_id, friend_username, created_at) VALUES (?, ?, ?)')
    .bind(playerId, friendUsername, Date.now()).run();
}

export async function getFriends(db: D1Database, playerId: string): Promise<string[]> {
  const res = await db.prepare('SELECT friend_username FROM friends WHERE player_id = ?').bind(playerId).all<{ friend_username: string }>();
  return (res.results ?? []).map((r) => r.friend_username);
}
