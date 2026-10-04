// Browser completions get in the way of this app's own pickers and editors, so
// every input and textarea opts out unless it names its own autocomplete token
// (sign-in and password fields keep theirs for password managers). Fields
// inside a rich-text editor (such as checklist checkboxes) are left alone:
// the editor owns that DOM and redraws a node whose attributes change, which
// would hand this observer a fresh field forever and freeze the page.
const FIELDS = "input:not([autocomplete]), textarea:not([autocomplete])";
const EDITABLE = "[contenteditable]:not([contenteditable=\"false\"])";

function optOutField(field: Element) {
  if (!field.closest(EDITABLE)) field.setAttribute("autocomplete", "off");
}

function optOut(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(FIELDS)) optOutField(node);
  node.querySelectorAll(FIELDS).forEach(optOutField);
}

/** Opts current and future fields under `root` out of browser completions. */
export function watchBrowserCompletions(root: HTMLElement) {
  optOut(root);
  const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(optOut)));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
