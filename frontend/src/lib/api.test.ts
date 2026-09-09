import { api, resolveApiBase } from "./api";

describe("resolveApiBase", () => {
  it("uses the configured API URL when supplied", () => {
    expect(resolveApiBase("https://know.example.com/api/v1")).toBe(
      "https://know.example.com/api/v1",
    );
  });

  it("uses the same-origin proxy during Vite development", () => {
    expect(resolveApiBase(undefined)).toBe(
      "/api/v1",
    );
  });

  it("uses the same-origin proxy in production by default", () => {
    expect(resolveApiBase(undefined)).toBe("/api/v1");
  });
});

describe("api", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends JSON headers and the stored bearer token, then parses JSON", async () => {
    localStorage.setItem("know_token", "token-1");
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{"ok":true}' });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{ ok: boolean }>("/paths", { method: "POST", body: "{}" })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/paths", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer token-1" }),
    }));
  });

  it("returns undefined for an empty successful response and 204 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, text: async () => "" })
      .mockResolvedValueOnce({ status: 204, ok: true, text: async () => "ignored" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/empty")).resolves.toBeUndefined();
    await expect(api("/deleted")).resolves.toBeUndefined();
  });

  it("clears an expired token, reloads, and exposes API error text", async () => {
    localStorage.setItem("know_token", "expired");
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, statusText: "Unauthorized", text: async () => "Session expired" }));

    await expect(api("/private")).rejects.toThrow("Session expired");
    expect(localStorage.getItem("know_token")).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it("uses the response status text when an error body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false, statusText: "Server failure", text: async () => "" }));

    await expect(api("/broken")).rejects.toThrow("Server failure");
  });

  it.each([404, 500, 502, 503, 504])("preserves sign-in on HTTP %s", async (status) => {
    localStorage.setItem("know_token", "valid-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, ok: false, text: async () => "Unavailable" }));
    await expect(api("/paths")).rejects.toThrow("Unavailable");
    expect(localStorage.getItem("know_token")).toBe("valid-token");
  });

  it("preserves sign-in when the API connection drops during deployment", async () => {
    localStorage.setItem("know_token", "valid-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/paths")).rejects.toThrow("Failed to fetch");
    expect(localStorage.getItem("know_token")).toBe("valid-token");
  });

  it("aborts requests that remain pending for 15 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url: string, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))));
    vi.stubGlobal("fetch", fetchMock);

    const request = api("/slow");
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15000);

    await rejection;
    vi.useRealTimers();
  });

  it("does not erase a newer sign-in when an older request returns 401", async () => {
    localStorage.setItem("know_token", "old-token");
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      localStorage.setItem("know_token", "new-token");
      return { status: 401, ok: false, text: async () => "Expired" };
    }));
    await expect(api("/paths")).rejects.toThrow("Expired");
    expect(localStorage.getItem("know_token")).toBe("new-token");
    expect(reload).not.toHaveBeenCalled();
  });
});
