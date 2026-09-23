import { format, parseISO } from "date-fns";

/** "9 Sep", with the year only when it is not the current one. */
export const shortCardDate = (value: Date, now = new Date()) => format(value, value.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");

/** A card's inclusive dates: "9 Sep" for one day, "9 Sep – 10 Sep" for a range. */
export function formatCardDates(start?: string | null, due?: string | null, now = new Date()) {
  const from = start ? shortCardDate(parseISO(start), now) : "";
  const until = due ? shortCardDate(parseISO(due), now) : "";
  if (from && until) return start === due ? from : `${from} – ${until}`;
  if (from) return `From ${from}`;
  return until ? `Until ${until}` : "";
}
