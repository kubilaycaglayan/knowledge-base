import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "./auth";

describe("auth store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("hydrates from and persists the session token", () => {
    localStorage.setItem("know_token", "initial-token");
    const store = useAuthStore();

    expect(store.token).toBe("initial-token");
    expect(store.isAuthenticated).toBe(true);

    store.setToken("next-token");
    expect(store.token).toBe("next-token");
    expect(localStorage.getItem("know_token")).toBe("next-token");
  });

  it("clears the reactive session and persisted token", () => {
    const store = useAuthStore();
    store.setToken("token");

    store.clearToken();

    expect(store.token).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(localStorage.getItem("know_token")).toBeNull();
  });
});
