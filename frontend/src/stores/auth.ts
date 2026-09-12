import { defineStore } from "pinia";

const TOKEN_KEY = "know_token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", {
  state: () => ({ token: readToken() as string | null }),
  getters: { isAuthenticated: (state) => Boolean(state.token) },
  actions: {
    setToken(token: string) {
      localStorage.setItem(TOKEN_KEY, token);
      this.token = token;
    },
    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
      this.token = null;
    },
    refresh() {
      this.token = readToken();
    },
  },
});
