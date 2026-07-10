import type { ApiResponse, AuthResponse, PlayerSave, OpponentTeamResponse } from '@pokemon-online/shared';

const TOKEN_KEY = 'po_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as Record<string, string> | undefined) };
  const token = getToken();
  if (token) headers['authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...opts, headers });
  let body: ApiResponse<T> | null = null;
  try { body = await res.json() as ApiResponse<T>; } catch { /* non-json */ }
  if (!res.ok || !body || body.ok === false) {
    throw new Error(body?.error ?? `请求失败 (${res.status})`);
  }
  return body.data as T;
}

export const api = {
  async register(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  },
  async login(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  },
  async me(): Promise<{ playerId: string; username: string; createdAt: number }> {
    return request('/api/me');
  },
  async getSave(): Promise<PlayerSave | null> {
    const r = await request<{ save: PlayerSave | null }>('/api/save');
    return r.save;
  },
  async putSave(save: PlayerSave): Promise<{ savedAt: number }> {
    return request('/api/save', { method: 'PUT', body: JSON.stringify({ save }) });
  },
  async getOpponent(username: string): Promise<OpponentTeamResponse> {
    return request<OpponentTeamResponse>('/api/opponent?username=' + encodeURIComponent(username));
  },
  async addFriend(username: string): Promise<{ friend: string }> {
    return request('/api/friend', { method: 'POST', body: JSON.stringify({ username }) });
  },
  async getFriends(): Promise<{ friends: string[] }> {
    return request('/api/friend');
  },
};
