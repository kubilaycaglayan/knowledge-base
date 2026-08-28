import { resolveApiBase } from "./api";

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
