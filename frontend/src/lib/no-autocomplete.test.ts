import { afterEach, describe, expect, it } from "vitest";
import { watchBrowserCompletions } from "./no-autocomplete";

describe("watchBrowserCompletions", () => {
  let stop = () => {};
  afterEach(() => { stop(); document.body.innerHTML = ""; });

  it("turns browser completions off on fields that do not choose their own", async () => {
    document.body.innerHTML = '<input id="plain"><textarea id="area"></textarea><input id="login" autocomplete="username">';
    stop = watchBrowserCompletions(document.body);
    expect(document.getElementById("plain")?.getAttribute("autocomplete")).toBe("off");
    expect(document.getElementById("area")?.getAttribute("autocomplete")).toBe("off");
    expect(document.getElementById("login")?.getAttribute("autocomplete")).toBe("username");

    const later = document.createElement("div");
    later.innerHTML = '<input id="late"><input id="password" type="password" autocomplete="current-password">';
    document.body.append(later);
    const added = document.createElement("input");
    document.body.append(added);
    await Promise.resolve();
    expect(document.getElementById("late")?.getAttribute("autocomplete")).toBe("off");
    expect(document.getElementById("password")?.getAttribute("autocomplete")).toBe("current-password");
    expect(added.getAttribute("autocomplete")).toBe("off");
  });
});
