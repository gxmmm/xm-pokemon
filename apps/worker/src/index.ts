import type { D1Database, Fetcher } from '@cloudflare/workers-types';
import type { PlayerSave, PokemonInstance, ApiResponse, AuthResponse, OpponentTeamResponse } from '@pokemon-online/shared';
import { SAVE_VERSION } from '@pokemon-online/shared';
import { hashPassword, newToken, newPlayerId, randomHex, validUsername, validPassword } from './auth.ts';
import {
  getPlayerByUsername, getPlayerByToken, createPlayer, setToken,
  getSave, upsertSave, addFriend, getFriends,
} from './db.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME?: string;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
});

const ok = <T>(data: T): ApiResponse<T> => ({ ok: true, data });
const fail = (error: string, status = 400): Response => json({ ok: false, error }, status);

async function readBody<T = unknown>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

async function authPlayer(env: Env, request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  return getPlayerByToken(env.DB, token);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type',
        },
      });
    }

    // Static SPA fallback: everything non-API goes to assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      switch (url.pathname) {
        case '/api/health':
          return json(ok({ status: 'ok', app: env.APP_NAME ?? 'Pokemon Online', time: Date.now() }));

        case '/api/register': {
          if (request.method !== 'POST') return fail('Method not allowed', 405);
          const body = await readBody<{ username?: string; password?: string }>(request);
          if (!body || !validUsername(body.username ?? '') || !validPassword(body.password ?? '')) {
            return fail('用户名或密码不合法（用户名2-20位，密码至少4位）');
          }
          const username = body.username!.trim();
          if (await getPlayerByUsername(env.DB, username)) return fail('该用户名已被占用', 409);
          const salt = randomHex(16);
          const password_hash = await hashPassword(body.password!, salt);
          const id = newPlayerId();
          const token = newToken();
          await createPlayer(env.DB, { id, username, password_hash, salt, token, created_at: Date.now() });
          const res: AuthResponse = { token, username, playerId: id };
          return json(ok(res));
        }

        case '/api/login': {
          if (request.method !== 'POST') return fail('Method not allowed', 405);
          const body = await readBody<{ username?: string; password?: string }>(request);
          if (!body || !body.username || !body.password) return fail('缺少用户名或密码');
          const row = await getPlayerByUsername(env.DB, body.username);
          if (!row) return fail('用户名或密码错误', 401);
          const hash = await hashPassword(body.password, row.salt);
          if (hash !== row.password_hash) return fail('用户名或密码错误', 401);
          const token = newToken();
          await setToken(env.DB, row.id, token);
          const res: AuthResponse = { token, username: row.username, playerId: row.id };
          return json(ok(res));
        }

        case '/api/me': {
          const player = await authPlayer(env, request);
          if (!player) return fail('未登录', 401);
          return json(ok({ playerId: player.id, username: player.username, createdAt: player.created_at }));
        }

        case '/api/save': {
          const player = await authPlayer(env, request);
          if (!player) return fail('未登录', 401);
          if (request.method === 'GET') {
            const row = await getSave(env.DB, player.id);
            if (!row) return json(ok<{ save: PlayerSave | null }>({ save: null }));
            try {
              const save = JSON.parse(row.data) as PlayerSave;
              return json(ok({ save }));
            } catch {
              return json(ok<{ save: PlayerSave | null }>({ save: null }));
            }
          }
          if (request.method === 'PUT') {
            const body = await readBody<{ save?: PlayerSave }>(request);
            if (!body || !body.save) return fail('缺少存档数据');
            const save = body.save;
            save.version = SAVE_VERSION;
            save.playerId = player.id;
            save.username = player.username;
            save.updatedAt = Date.now();
            await upsertSave(env.DB, player.id, JSON.stringify(save), save.updatedAt);
            return json(ok({ savedAt: save.updatedAt }));
          }
          return fail('Method not allowed', 405);
        }

        case '/api/opponent': {
          // PVP: fetch another player's battle team (full instances for simulation)
          const player = await authPlayer(env, request);
          if (!player) return fail('未登录', 401);
          const username = url.searchParams.get('username');
          if (!username) return fail('缺少 username 参数');
          const target = await getPlayerByUsername(env.DB, username);
          if (!target) return fail('找不到该玩家', 404);
          const saveRow = await getSave(env.DB, target.id);
          let team: PokemonInstance[] = [];
          if (saveRow) {
            try {
              const save = JSON.parse(saveRow.data) as PlayerSave;
              team = (save.pvpTeam ?? [])
                .map((uid: string) => save.instances?.[uid])
                .filter((x: unknown): x is PokemonInstance => !!x)
                .filter((x: PokemonInstance) => x.currentHp > 0);
            } catch { team = []; }
          }
          const res: OpponentTeamResponse = { username: target.username, team };
          return json(ok(res));
        }

        case '/api/friend': {
          const player = await authPlayer(env, request);
          if (!player) return fail('未登录', 401);
          if (request.method === 'POST') {
            const body = await readBody<{ username?: string }>(request);
            if (!body?.username) return fail('缺少 username');
            const target = await getPlayerByUsername(env.DB, body.username);
            if (!target) return fail('找不到该玩家', 404);
            await addFriend(env.DB, player.id, target.username);
            return json(ok({ friend: target.username }));
          }
          if (request.method === 'GET') {
            const friends = await getFriends(env.DB, player.id);
            return json(ok({ friends }));
          }
          return fail('Method not allowed', 405);
        }

        default:
          return fail('Not found', 404);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'internal error';
      return fail('服务器错误: ' + msg, 500);
    }
  },
};
