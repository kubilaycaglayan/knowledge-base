const GUTTER = 16, TRACKER_GAP = 8;

/**
 * How far above the viewport's bottom edge the snackbar sits: just above the
 * floating time tracker when it is on screen, otherwise the usual gutter.
 */
export function snackbarBottom(viewportHeight: number, trackerTop: number | null) {
  if (trackerTop === null || trackerTop >= viewportHeight) return GUTTER;
  return Math.max(GUTTER, Math.round(viewportHeight - trackerTop + TRACKER_GAP));
}
