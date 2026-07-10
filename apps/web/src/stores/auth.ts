import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, getToken, setToken } from '../api/client.ts';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken());
  const username = ref<string | null>(null);
  const playerId = ref<string | null>(null);
  const ready = ref(false);

  const isAuthenticated = computed(() => !!token.value);

  async function restore(): Promise<void> {
    if (!token.value) { ready.value = true; return; }
    try {
      const me = await api.me();
      username.value = me.username;
      playerId.value = me.playerId;
    } catch {
      // token invalid
      setToken(null);
      token.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(uname: string, pw: string): Promise<void> {
    const res = await api.login(uname, pw);
    token.value = res.token; username.value = res.username; playerId.value = res.playerId;
    setToken(res.token);
  }

  async function register(uname: string, pw: string): Promise<void> {
    const res = await api.register(uname, pw);
    token.value = res.token; username.value = res.username; playerId.value = res.playerId;
    setToken(res.token);
  }

  function logout(): void {
    setToken(null);
    token.value = null; username.value = null; playerId.value = null;
  }

  return { token, username, playerId, ready, isAuthenticated, restore, login, register, logout };
});
