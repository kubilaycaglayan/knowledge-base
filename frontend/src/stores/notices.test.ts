import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNoticesStore } from "./notices";

describe("notices store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows the latest message and dismisses it", () => {
    const notices = useNoticesStore();
    notices.notify("Could not create card.");
    const first = notices.current;
    expect(first).toMatchObject({ text: "Could not create card.", tone: "error" });
    notices.notify("Saved", "info");
    expect(notices.current).toMatchObject({ text: "Saved", tone: "info" });
    expect(notices.current?.id).not.toBe(first?.id);
    notices.dismiss();
    expect(notices.current).toBeNull();
  });
});
