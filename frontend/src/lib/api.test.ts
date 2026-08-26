import { resolveApiBase } from "./api";

describe("resolveApiBase", () => {
  it("uses the configured API URL when supplied", () => {
    expect(resolveApiBase("https://know.example.com/api/v1", false)).toBe(
      "https://know.example.com/api/v1",
    );
  });

  it("uses localhost during Vite development", () => {
    expect(resolveApiBase(undefined, true)).toBe(
      "http://localhost:8080/api/v1",
    );
  });

  it("uses the same-origin proxy in production by default", () => {
    expect(resolveApiBase(undefined, false)).toBe("/api/v1");
  });
});
