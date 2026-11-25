const DAY = 24 * 60 * 60 * 1000;

// No local day is longer than 25 hours, the longest a clock change makes one.
const LONGEST_DAY = 25 * 60 * 60 * 1000;

const formats = new Map<string, Intl.DateTimeFormat>();

const createFormat = (timeZone: string | undefined) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

// A format made for the device's zone keeps the zone it was made in, so it
// is made afresh each time and follows a person who travels.
const formatFor = (timeZone: string | undefined) => {
  if (timeZone === undefined) {
    return createFormat(undefined);
  }

  let format = formats.get(timeZone);

  if (!format) {
    format = createFormat(timeZone);
    formats.set(timeZone, format);
  }

  return format;
};

/**
 * The calendar day `instant` falls on in `timeZone`, the device's own when
 * none is given, as a count of days, so two of them subtract to the days
 * between, whatever a clock change does to the hours.
 */
export const localDay = (instant: number, timeZone?: string) => {
  const parts = formatFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((found) => found.type === type)?.value);

  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY;
};

/**
 * Calendar days from today to the trial's last day: 0 on that day,
 * 1 the day before, and so on. A trial that ends at midnight has the day
 * before as its last.
 */
export const trialDaysLeft = (
  trialEndsAt: number,
  now: number,
  timeZone?: string
) => localDay(trialEndsAt - 1, timeZone) - localDay(now, timeZone);

/** The first instant after `now` on the next calendar day in `timeZone`. */
export const nextLocalDay = (now: number, timeZone?: string) => {
  const today = localDay(now, timeZone);
  let before = now;
  let after = now + LONGEST_DAY;

  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);

    if (localDay(middle, timeZone) === today) {
      before = middle;
    } else {
      after = middle;
    }
  }

  return after;
};
