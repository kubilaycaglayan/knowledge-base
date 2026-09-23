// Browser completions get in the way of this app's own pickers and editors, so
// every input and textarea opts out unless it names its own autocomplete token
// (sign-in and password fields keep theirs for password managers).
const FIELDS = "input:not([autocomplete]), textarea:not([autocomplete])";

function optOut(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(FIELDS)) node.setAttribute("autocomplete", "off");
  node.querySelectorAll(FIELDS).forEach((field) => field.setAttribute("autocomplete", "off"));
}

/** Opts current and future fields under `root` out of browser completions. */
export function watchBrowserCompletions(root: HTMLElement) {
  optOut(root);
  const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(optOut)));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
