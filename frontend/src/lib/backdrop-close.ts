import type { ObjectDirective } from "vue";

type Close = (event: MouseEvent) => void;
type State = { close: Close; cleanup: () => void };

const states = new WeakMap<HTMLElement, State>();

/**
 * Close a dialog when its backdrop is clicked, but only when the press also
 * started on the backdrop. A text selection dragged out of the dialog ends
 * with a click on the backdrop, and that must not close it.
 */
export const vBackdropClose: ObjectDirective<HTMLElement, Close> = {
  mounted(element, binding) {
    let pressedOnBackdrop = false;
    const press = (event: Event) => {
      pressedOnBackdrop = event.target === element;
    };
    const click = (event: MouseEvent) => {
      const close = pressedOnBackdrop && event.target === element;
      pressedOnBackdrop = false;
      if (close) states.get(element)?.close(event);
    };
    element.addEventListener("pointerdown", press);
    element.addEventListener("click", click);
    states.set(element, {
      close: binding.value,
      cleanup: () => {
        element.removeEventListener("pointerdown", press);
        element.removeEventListener("click", click);
      },
    });
  },
  updated(element, binding) {
    const state = states.get(element);
    if (state) state.close = binding.value;
  },
  unmounted(element) {
    states.get(element)?.cleanup();
    states.delete(element);
  },
};
