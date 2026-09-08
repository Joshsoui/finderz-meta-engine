/** Today's date (YYYY-MM-DD) in Europe/Amsterdam local time -- the "day" a spend figure belongs to, not the UTC day the server happens to be in. */
export function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

/** The Amsterdam-local date N days before today, as YYYY-MM-DD -- used to build a "last 7 days" cutoff (days=6, inclusive of today). */
export function amsterdamDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(date);
}
