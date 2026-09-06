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
});
