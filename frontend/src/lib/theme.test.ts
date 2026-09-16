import bootstrap from "../../public/theme.js?raw";
import { applyTheme, theme, themePreference, toggleTheme } from "./theme";

function runBootstrap(context: {
  document: unknown;
  localStorage: unknown;
  window: unknown;
}) {
  new Function("document", "localStorage", "window", bootstrap)(
    context.document,
    context.localStorage,
    context.window,
  );
}

describe("application theme", () => {
  beforeEach(() => {
    localStorage.clear();
    applyTheme("light");
  });
  it("toggles and persists an explicit preference", () => {
    toggleTheme();
    expect(theme.value).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("knowledge-base-theme")).toBe("dark");
    toggleTheme();
    expect(localStorage.getItem("knowledge-base-theme")).toBe("light");
    toggleTheme();
    expect(themePreference.value).toBe("auto");
    expect(localStorage.getItem("knowledge-base-theme")).toBe("auto");
  });
  it.each([
    [null, true, "dark"],
    [null, false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["invalid", true, "dark"],
  ])(
    "bootstraps saved preference %s with system dark %s",
    (saved, dark, expected) => {
      const root = { dataset: {}, style: {} };
      runBootstrap({
        document: { documentElement: root },
        localStorage: { getItem: () => saved },
        window: { matchMedia: () => ({ matches: dark }) },
      });
      expect(root.dataset).toEqual({ theme: expected });
      expect(root.style).toEqual({ colorScheme: expected });
    },
  );
  it("boots when storage is blocked", () => {
    const root = { dataset: {}, style: {} };
    runBootstrap({
      document: { documentElement: root },
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      window: { matchMedia: () => ({ matches: true }) },
    });
    expect(root.dataset).toEqual({ theme: "dark" });
  });
});
