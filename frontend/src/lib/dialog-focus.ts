import type { ObjectDirective } from "vue";

const cleanup = new WeakMap<HTMLElement, () => void>();
const focusable =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

/** Keep keyboard focus in an open dialog and return it to its trigger. */
export const vDialogFocus: ObjectDirective<HTMLElement> = {
  mounted(element) {
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(element.querySelectorAll<HTMLElement>(focusable)).filter(
        (control) => control.getClientRects().length,
      );
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const targets = controls();
      const first = targets[0] || element;
      const last = targets.at(-1) || element;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === element)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    element.addEventListener("keydown", trap);
    // Mounted hooks run before the whole parent tree is attached.
    queueMicrotask(() => {
      if (element.isConnected) (controls()[0] || element).focus();
    });
    cleanup.set(element, () => {
      element.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    });
  },
  unmounted(element) {
    cleanup.get(element)?.();
    cleanup.delete(element);
  },
};
