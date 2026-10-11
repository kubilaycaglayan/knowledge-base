// Shared browser checks for keyboard focus visibility and modal/drawer
// containment. Each helper returns a list of problems so a sweep can report
// every failing state at once instead of stopping at the first.

const focusSnapshot = (scopeSelector) => {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) return { body: true };
  // Field wrappers (Vuetify fields, the date picker input) own the visible box.
  const visualTarget = element.closest(".v-field, .dp__input_wrap") || element;
  const rect = visualTarget.getBoundingClientRect();
  const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  // A focus indicator is a 2px+ outline on the control, its field, or a nearby
  // :focus-within wrapper, or a box-shadow ring/underline on the control.
  const ringHosts = [element, visualTarget];
  for (let node = element.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth += 1) ringHosts.push(node);
  const hasRing = ringHosts.some((node) => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2 && (node === element || node === visualTarget || node.matches(":focus-within"));
  }) || getComputedStyle(element).boxShadow !== "none";
  const id = element.getAttribute("data-focus-audit-id") || crypto.randomUUID();
  element.setAttribute("data-focus-audit-id", id);
  const scope = scopeSelector ? document.querySelector(scopeSelector) : null;
  // Only fixed or sticky layers count as obscuring focus; in-flow siblings such
  // as a card footer over a stretched card link are part of the design.
  const pinnedLayer = (node) => {
    for (let current = node; current instanceof Element; current = current.parentElement) {
      if (/^(fixed|sticky)$/.test(getComputedStyle(current).position)) return current;
    }
    return null;
  };
  const layer = center instanceof Element && center !== visualTarget && !visualTarget.contains(center) ? pinnedLayer(center) : null;
  // A region taller or wider than the usable viewport (after the page's scroll
  // padding, which keeps focus clear of the fixed footer) only has to overlap it.
  const rootStyle = getComputedStyle(document.documentElement);
  const usableHeight = innerHeight - (Number.parseFloat(rootStyle.scrollPaddingTop) || 0) - (Number.parseFloat(rootStyle.scrollPaddingBottom) || 0);
  const fits = rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1;
  const overlapsOversized = (rect.height > usableHeight || rect.width > innerWidth) && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  return {
    id,
    name: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) || element.tagName,
    inScope: !scope || scope.contains(element),
    visible: rect.width > 0 && rect.height > 0 && (fits || overlapsOversized),
    ring: hasRing,
    covered: Boolean(layer) && !layer.contains(visualTarget),
    coveredBy: center instanceof Element ? `${center.tagName.toLowerCase()}.${[...center.classList].join(".")}` : String(center),
  };
};

// Walks a full keyboard focus cycle and checks that every focused control is
// inside the viewport, shows a 2px focus indicator, and is not covered by
// fixed or sticky UI at its center point.
export async function auditFocusCycle(page, label, { key = "Tab", scope = null, limit = 120, stopOutside = false } = {}) {
  const problems = [];
  const seen = new Set();
  let completed = false;
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press(key);
    // Let focus-driven scrolling settle before measuring.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const focus = await page.evaluate(focusSnapshot, scope);
    if (focus.body) {
      completed = seen.size > 0;
      break;
    }
    if (seen.has(focus.id)) {
      completed = true;
      break;
    }
    // Non-modal overlays (menus, disclosure panels) hand focus back to the page.
    if (stopOutside && !focus.inScope) {
      completed = seen.size > 0;
      break;
    }
    seen.add(focus.id);
    const where = `${label} ${key} ${index + 1} (${focus.name})`;
    if (!focus.inScope) problems.push(`${where}: focus left the open overlay`);
    if (!focus.visible) problems.push(`${where}: focused control is outside the viewport`);
    if (!focus.ring) problems.push(`${where}: no visible focus indicator`);
    if (focus.covered) problems.push(`${where}: covered by ${focus.coveredBy}`);
  }
  if (!completed) problems.push(`${label}: ${key} did not complete a focus cycle within ${limit} stops (saw ${seen.size})`);
  return problems;
}

// Checks that an open overlay fits the viewport or scrolls inside itself with
// contained overscroll, so scrolling it never moves the page behind it.
export async function auditContainment(page, overlay, label) {
  const problems = [];
  const layout = await overlay.evaluate((element) => {
    const scrollers = [element, ...element.querySelectorAll("*")].filter((node) => {
      const style = getComputedStyle(node);
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    });
    const rect = element.getBoundingClientRect();
    const fits = rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1;
    const clipped = !fits && scrollers.length === 0;
    const uncontained = scrollers.filter((node) => !/(contain|none)/.test(getComputedStyle(node).overscrollBehaviorY))
      .map((node) => `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`);
    const marker = scrollers[0] ? (scrollers[0].dataset.overlayScroller = "true", true) : false;
    return { fits, clipped, uncontained, hasScroller: marker, pageScroll: scrollY };
  });
  if (layout.clipped) problems.push(`${label}: overlay is larger than the viewport and has no internal scroller`);
  if (layout.uncontained.length) problems.push(`${label}: scrollers without contained overscroll: ${layout.uncontained.join(", ")}`);
  if (layout.hasScroller) {
    const scroller = overlay.page().locator('[data-overlay-scroller="true"]');
    await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    const box = await scroller.boundingBox();
    await page.mouse.move(box.x + box.width / 2, Math.max(box.y, 0) + Math.min(box.height, 40) / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => scrollY);
    if (after !== layout.pageScroll) problems.push(`${label}: scrolling past the overlay end moved the page from ${layout.pageScroll} to ${after}`);
    await scroller.evaluate((node) => { node.scrollTop = 0; delete node.dataset.overlayScroller; });
  }
  return problems;
}

// Brings the close/cancel action into view, checks it is unobscured, and
// activates it with touch (phone) or a click (desktop).
export async function auditCloseAction(page, overlay, close, label, { touch }) {
  const problems = [];
  await close.scrollIntoViewIfNeeded();
  const state = await close.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      visible: rect.width > 0 && rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1,
      covered: Boolean(center) && center !== element && !element.contains(center),
      size: Math.min(rect.width, rect.height),
    };
  });
  if (!state.visible) problems.push(`${label}: close action is not reachable inside the viewport`);
  if (state.covered) problems.push(`${label}: close action is covered`);
  if (touch && state.size < 24) problems.push(`${label}: close action is only ${state.size}px`);
  if (touch) await close.tap();
  else await close.click();
  try {
    await overlay.waitFor({ state: "hidden", timeout: 3000 });
  } catch {
    problems.push(`${label}: overlay stayed open after its close action`);
  }
  return problems;
}

// Phone-width flows must be driven by touch. Records every trusted mouse
// pointerdown in the context and fails the test if any occurred, so a stray
// click() in a phone flow cannot pass as touch evidence.
const touchContexts = new WeakSet();
export async function requireTouchInput(t, context) {
  touchContexts.add(context);
  const mouseInputs = [];
  await context.exposeBinding("__reportMouseInput", ({ page }, target) => mouseInputs.push(`${new URL(page.url()).pathname}: ${target}`));
  await context.addInitScript(() => {
    addEventListener("pointerdown", (event) => {
      if (!event.isTrusted || event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target : null;
      const label = target?.closest("[aria-label]")?.getAttribute("aria-label") || target?.textContent?.trim().slice(0, 40) || target?.tagName;
      window.__reportMouseInput(`${target?.tagName.toLowerCase()} “${label}”`);
    }, true);
  });
  t.after(() => {
    if (mouseInputs.length) throw new Error(`Phone-width flow used mouse input instead of touch: ${mouseInputs.join("; ")}`);
  });
}

// Activates a control the way the context's user would: a tap on touch
// (phone-width) contexts and a click elsewhere.
export function activate(locator, options) {
  return touchContexts.has(locator.page().context()) ? locator.tap(options) : locator.click(options);
}

// Native select popups are browser chrome rather than page content, so they
// cannot be tapped as DOM options in headless Chromium. Focus the select with
// the context's normal pointer input, then choose the visible option with the
// native keyboard controls instead of Playwright's programmatic selectOption.
export async function chooseNativeOption(locator, expectedValue) {
  const options = await locator.locator("option").evaluateAll((items) => items.map((item) => item.value));
  const targetIndex = options.indexOf(expectedValue);
  if (targetIndex < 0) throw new Error(`Native select does not contain option value ${expectedValue}`);
  await activate(locator);
  await locator.press("Home");
  for (let index = 0; index < targetIndex; index += 1) await locator.press("ArrowDown");
  await locator.press("Enter");
  const actualValue = await locator.inputValue();
  if (actualValue !== expectedValue) throw new Error(`Native select chose ${actualValue}, expected ${expectedValue}`);
}
