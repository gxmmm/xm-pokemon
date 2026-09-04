import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, ApiError, getToken, setToken } from '../api/client.ts';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken());
  const username = ref<string | null>(null);
  const playerId = ref<string | null>(null);
  const ready = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value);

  async function restore(): Promise<boolean> {
    error.value = null;
    if (!token.value) { ready.value = true; return true; }
    try {
      const me = await api.me();
      username.value = me.username;
      playerId.value = me.playerId;
      ready.value = true;
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        logout();
        return true;
      }
      error.value = e instanceof Error ? e.message : '连接失败，请重试';
      ready.value = false;
      return false;
    }
  }

  async function login(uname: string, pw: string): Promise<void> {
    const res = await api.login(uname, pw);
    token.value = res.token; username.value = res.username; playerId.value = res.playerId;
    setToken(res.token);
    ready.value = true; error.value = null;
  }

  async function register(uname: string, pw: string): Promise<void> {
    const res = await api.register(uname, pw);
    token.value = res.token; username.value = res.username; playerId.value = res.playerId;
    setToken(res.token);
    ready.value = true; error.value = null;
  }

  function logout(): void {
    setToken(null);
    token.value = null; username.value = null; playerId.value = null;
    ready.value = true; error.value = null;
  }

  return { token, username, playerId, ready, error, isAuthenticated, restore, login, register, logout };
});
