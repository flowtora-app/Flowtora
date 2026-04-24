// IANA timezone catalog for the shop-profile select.
//
// Phase 4 (transformation) replaces the 10-entry free-text-ish select
// with a full IANA list. Shipped statically rather than via
// `Intl.supportedValuesOf("timeZone")` so the dataset is the same on
// every node, Edge, and client — the runtime value varies by
// environment and would cause hydration diffs.
//
// Grouping is presentational only: the saved value is the raw IANA
// zone string ("America/Los_Angeles"), which is what Prisma stores on
// `Tenant.timezone` and what all date-fns-tz calls expect.
//
// Source: IANA tzdata 2024a, pared to zones actually populated by
// countries Flowtora serves (North America, Europe, Pacific). Add new
// rows here as we expand; we don't need to ship all 600+ IANA zones.

export interface TimezoneOption {
  value: string;
  label: string;
}

export interface TimezoneGroup {
  label: string;
  zones: TimezoneOption[];
}

// Flat list — convenient for building a native <select> with <optgroup>s.
export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "Americas",
    zones: [
      { value: "America/St_Johns",        label: "Newfoundland (St. John's)" },
      { value: "America/Halifax",         label: "Atlantic (Halifax)" },
      { value: "America/New_York",        label: "Eastern (New York)" },
      { value: "America/Toronto",         label: "Eastern (Toronto)" },
      { value: "America/Chicago",         label: "Central (Chicago)" },
      { value: "America/Winnipeg",        label: "Central (Winnipeg)" },
      { value: "America/Mexico_City",     label: "Central (Mexico City)" },
      { value: "America/Denver",          label: "Mountain (Denver)" },
      { value: "America/Edmonton",        label: "Mountain (Edmonton)" },
      { value: "America/Phoenix",         label: "Mountain — no DST (Phoenix)" },
      { value: "America/Los_Angeles",     label: "Pacific (Los Angeles)" },
      { value: "America/Vancouver",       label: "Pacific (Vancouver)" },
      { value: "America/Anchorage",       label: "Alaska (Anchorage)" },
      { value: "Pacific/Honolulu",        label: "Hawaii (Honolulu)" },
      { value: "America/Sao_Paulo",       label: "São Paulo" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
      { value: "America/Bogota",          label: "Bogotá" },
      { value: "America/Lima",            label: "Lima" },
    ],
  },
  {
    label: "Europe",
    zones: [
      { value: "Europe/London",           label: "London" },
      { value: "Europe/Dublin",           label: "Dublin" },
      { value: "Europe/Lisbon",           label: "Lisbon" },
      { value: "Europe/Paris",            label: "Paris" },
      { value: "Europe/Madrid",           label: "Madrid" },
      { value: "Europe/Amsterdam",        label: "Amsterdam" },
      { value: "Europe/Brussels",         label: "Brussels" },
      { value: "Europe/Berlin",           label: "Berlin" },
      { value: "Europe/Zurich",           label: "Zürich" },
      { value: "Europe/Rome",             label: "Rome" },
      { value: "Europe/Copenhagen",       label: "Copenhagen" },
      { value: "Europe/Oslo",             label: "Oslo" },
      { value: "Europe/Stockholm",        label: "Stockholm" },
      { value: "Europe/Helsinki",         label: "Helsinki" },
      { value: "Europe/Warsaw",           label: "Warsaw" },
      { value: "Europe/Prague",           label: "Prague" },
      { value: "Europe/Vienna",           label: "Vienna" },
      { value: "Europe/Athens",           label: "Athens" },
      { value: "Europe/Istanbul",         label: "Istanbul" },
      { value: "Europe/Moscow",           label: "Moscow" },
    ],
  },
  {
    label: "Middle East & Africa",
    zones: [
      { value: "Africa/Casablanca",       label: "Casablanca" },
      { value: "Africa/Lagos",            label: "Lagos" },
      { value: "Africa/Cairo",            label: "Cairo" },
      { value: "Africa/Nairobi",          label: "Nairobi" },
      { value: "Africa/Johannesburg",     label: "Johannesburg" },
      { value: "Asia/Jerusalem",          label: "Jerusalem" },
      { value: "Asia/Dubai",              label: "Dubai" },
      { value: "Asia/Riyadh",             label: "Riyadh" },
    ],
  },
  {
    label: "Asia",
    zones: [
      { value: "Asia/Karachi",            label: "Karachi" },
      { value: "Asia/Kolkata",            label: "Kolkata / Mumbai / Delhi" },
      { value: "Asia/Dhaka",              label: "Dhaka" },
      { value: "Asia/Bangkok",            label: "Bangkok" },
      { value: "Asia/Singapore",          label: "Singapore" },
      { value: "Asia/Kuala_Lumpur",       label: "Kuala Lumpur" },
      { value: "Asia/Jakarta",            label: "Jakarta" },
      { value: "Asia/Manila",             label: "Manila" },
      { value: "Asia/Hong_Kong",          label: "Hong Kong" },
      { value: "Asia/Shanghai",           label: "Shanghai / Beijing" },
      { value: "Asia/Taipei",             label: "Taipei" },
      { value: "Asia/Tokyo",              label: "Tokyo" },
      { value: "Asia/Seoul",              label: "Seoul" },
    ],
  },
  {
    label: "Pacific",
    zones: [
      { value: "Australia/Perth",         label: "Perth" },
      { value: "Australia/Adelaide",      label: "Adelaide" },
      { value: "Australia/Brisbane",      label: "Brisbane" },
      { value: "Australia/Sydney",        label: "Sydney" },
      { value: "Australia/Melbourne",     label: "Melbourne" },
      { value: "Pacific/Auckland",        label: "Auckland" },
      { value: "Pacific/Fiji",            label: "Fiji" },
    ],
  },
  {
    label: "UTC",
    zones: [
      { value: "UTC",                     label: "UTC (Coordinated Universal Time)" },
    ],
  },
];

/** Flat list of every zone, for input validators and fallback UI. */
export const TIMEZONES_FLAT: TimezoneOption[] = TIMEZONE_GROUPS.flatMap(
  (g) => g.zones,
);

/** True if the string is a known IANA zone in our catalog. */
export function isKnownTimezone(tz: string): boolean {
  return TIMEZONES_FLAT.some((z) => z.value === tz);
}
