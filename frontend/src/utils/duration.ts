export function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((value % 3600) / 60).toString().padStart(2, "0");
  const remainder = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

export function decimalHours(seconds: number): number {
  return Math.max(0, seconds) / 3600;
}

export function percentageOf(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}
