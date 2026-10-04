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

  it("leaves fields inside a rich-text editor to the editor", async () => {
    document.body.innerHTML = '<div contenteditable="true"><ul><li><label contenteditable="false"><input id="task" type="checkbox"></label></li></ul></div>';
    stop = watchBrowserCompletions(document.body);
    expect(document.getElementById("task")?.hasAttribute("autocomplete")).toBe(false);

    const item = document.createElement("li");
    item.innerHTML = '<label contenteditable="false"><input id="late-task" type="checkbox"></label>';
    document.querySelector("ul")?.append(item);
    await Promise.resolve();
    expect(document.getElementById("late-task")?.hasAttribute("autocomplete")).toBe(false);
  });
});
