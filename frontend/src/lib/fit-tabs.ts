/**
 * How many tabs, in order, fit in `available` pixels. When they do not all
 * fit, room is kept for a More button (`moreWidth`) after the last one.
 */
export function fitTabs(widths: number[], available: number, moreWidth: number, gap: number) {
  const total = widths.reduce((sum, width, index) => sum + width + (index ? gap : 0), 0);
  if (total <= available) return widths.length;
  const room = available - moreWidth - gap;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = used + (count ? gap : 0) + width;
    if (next > room) break;
    used = next;
    count += 1;
  }
  return count;
}
