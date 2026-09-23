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
    expect(document.querySelector('.app-snackbar [role="status"]')).not.toBeNull();
    (document.querySelector('.app-snackbar button[aria-label="Dismiss message"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(notices.current).toBeNull();
    wrapper.unmount();
  });
});
