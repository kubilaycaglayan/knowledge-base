import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vuetify from "../plugins/vuetify";
import AppSnackbar from "./AppSnackbar.vue";
import { useNoticesStore } from "../stores/notices";

describe("AppSnackbar", () => {
  // jsdom has no visual viewport; Vuetify's overlay positioning reads one.
  beforeEach(() => { vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 })); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("shows a notice politely and dismisses it", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(AppSnackbar, { global: { plugins: [vuetify] }, attachTo: document.body });
    const notices = useNoticesStore();
    notices.notify("Could not start a session. Try again.");
    await flushPromises();
    const snackbar = document.querySelector(".app-snackbar");
    expect(snackbar?.textContent).toContain("Could not start a session. Try again.");
    const errorStatus = document.querySelector('.app-snackbar [role="status"]');
    expect(errorStatus?.textContent).toContain("Could not start a session. Try again.");
    expect(snackbar?.classList.contains("tone-error")).toBe(true);
    expect(errorStatus?.textContent).not.toContain("Path saved.");
    (document.querySelector('.app-snackbar button[aria-label="Dismiss message"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(notices.current).toBeNull();

    notices.notify("Path saved.", "info");
    await flushPromises();
    const successSnackbar = document.querySelector(".app-snackbar");
    const successStatus = document.querySelector('.app-snackbar [role="status"]');
    expect(successSnackbar?.textContent).toContain("Path saved.");
    expect(successStatus?.textContent).toContain("Path saved.");
    expect(successSnackbar?.classList.contains("tone-info")).toBe(true);
    wrapper.unmount();
  });
});
