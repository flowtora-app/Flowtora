// Country code normalization.
//
// Tenant.country is a free-form String, so we get a mix of "United
// States" / "USA" / "US" / "us". For map rendering we need:
//   - ISO 3166-1 alpha-2  (display + flag emoji)
//   - ISO 3166-1 numeric  (3-digit, what world-atlas-110m uses as `id`)
//   - canonical English name
//
// The table covers the ~80 countries we actually care about — enough
// for a global SaaS map without pulling a 50KB i18n-iso-countries dep.
// `normalizeCountry()` accepts whatever variants we've seen in the
// wild and returns the canonical record.

export interface CountryRecord {
  iso2: string;
  /** Numeric ISO 3166-1 code as a 3-char zero-padded string — matches
   *  the `id` field of features in world-atlas-110m. */
  isoNum: string;
  name: string;
}

const COUNTRIES: CountryRecord[] = [
  { iso2: "US", isoNum: "840", name: "United States" },
  { iso2: "CA", isoNum: "124", name: "Canada" },
  { iso2: "GB", isoNum: "826", name: "United Kingdom" },
  { iso2: "AU", isoNum: "036", name: "Australia" },
  { iso2: "NZ", isoNum: "554", name: "New Zealand" },
  { iso2: "IE", isoNum: "372", name: "Ireland" },
  { iso2: "DE", isoNum: "276", name: "Germany" },
  { iso2: "FR", isoNum: "250", name: "France" },
  { iso2: "ES", isoNum: "724", name: "Spain" },
  { iso2: "IT", isoNum: "380", name: "Italy" },
  { iso2: "PT", isoNum: "620", name: "Portugal" },
  { iso2: "NL", isoNum: "528", name: "Netherlands" },
  { iso2: "BE", isoNum: "056", name: "Belgium" },
  { iso2: "LU", isoNum: "442", name: "Luxembourg" },
  { iso2: "AT", isoNum: "040", name: "Austria" },
  { iso2: "CH", isoNum: "756", name: "Switzerland" },
  { iso2: "SE", isoNum: "752", name: "Sweden" },
  { iso2: "NO", isoNum: "578", name: "Norway" },
  { iso2: "DK", isoNum: "208", name: "Denmark" },
  { iso2: "FI", isoNum: "246", name: "Finland" },
  { iso2: "IS", isoNum: "352", name: "Iceland" },
  { iso2: "PL", isoNum: "616", name: "Poland" },
  { iso2: "CZ", isoNum: "203", name: "Czechia" },
  { iso2: "SK", isoNum: "703", name: "Slovakia" },
  { iso2: "HU", isoNum: "348", name: "Hungary" },
  { iso2: "RO", isoNum: "642", name: "Romania" },
  { iso2: "BG", isoNum: "100", name: "Bulgaria" },
  { iso2: "GR", isoNum: "300", name: "Greece" },
  { iso2: "HR", isoNum: "191", name: "Croatia" },
  { iso2: "SI", isoNum: "705", name: "Slovenia" },
  { iso2: "EE", isoNum: "233", name: "Estonia" },
  { iso2: "LV", isoNum: "428", name: "Latvia" },
  { iso2: "LT", isoNum: "440", name: "Lithuania" },
  { iso2: "MT", isoNum: "470", name: "Malta" },
  { iso2: "CY", isoNum: "196", name: "Cyprus" },
  { iso2: "TR", isoNum: "792", name: "Turkey" },
  { iso2: "IL", isoNum: "376", name: "Israel" },
  { iso2: "AE", isoNum: "784", name: "United Arab Emirates" },
  { iso2: "SA", isoNum: "682", name: "Saudi Arabia" },
  { iso2: "QA", isoNum: "634", name: "Qatar" },
  { iso2: "KW", isoNum: "414", name: "Kuwait" },
  { iso2: "JP", isoNum: "392", name: "Japan" },
  { iso2: "KR", isoNum: "410", name: "South Korea" },
  { iso2: "CN", isoNum: "156", name: "China" },
  { iso2: "TW", isoNum: "158", name: "Taiwan" },
  { iso2: "HK", isoNum: "344", name: "Hong Kong" },
  { iso2: "SG", isoNum: "702", name: "Singapore" },
  { iso2: "MY", isoNum: "458", name: "Malaysia" },
  { iso2: "TH", isoNum: "764", name: "Thailand" },
  { iso2: "ID", isoNum: "360", name: "Indonesia" },
  { iso2: "PH", isoNum: "608", name: "Philippines" },
  { iso2: "VN", isoNum: "704", name: "Vietnam" },
  { iso2: "IN", isoNum: "356", name: "India" },
  { iso2: "PK", isoNum: "586", name: "Pakistan" },
  { iso2: "BD", isoNum: "050", name: "Bangladesh" },
  { iso2: "LK", isoNum: "144", name: "Sri Lanka" },
  { iso2: "ZA", isoNum: "710", name: "South Africa" },
  { iso2: "NG", isoNum: "566", name: "Nigeria" },
  { iso2: "KE", isoNum: "404", name: "Kenya" },
  { iso2: "EG", isoNum: "818", name: "Egypt" },
  { iso2: "MA", isoNum: "504", name: "Morocco" },
  { iso2: "BR", isoNum: "076", name: "Brazil" },
  { iso2: "MX", isoNum: "484", name: "Mexico" },
  { iso2: "AR", isoNum: "032", name: "Argentina" },
  { iso2: "CL", isoNum: "152", name: "Chile" },
  { iso2: "CO", isoNum: "170", name: "Colombia" },
  { iso2: "PE", isoNum: "604", name: "Peru" },
  { iso2: "UY", isoNum: "858", name: "Uruguay" },
  { iso2: "RU", isoNum: "643", name: "Russia" },
  { iso2: "UA", isoNum: "804", name: "Ukraine" },
  { iso2: "BY", isoNum: "112", name: "Belarus" },
  { iso2: "KZ", isoNum: "398", name: "Kazakhstan" },
];

// Aliases — common variants we've seen in user-supplied "country"
// strings. Lowercased keys; values reference by iso2.
const ALIASES: Record<string, string> = {
  "usa": "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "united states of america": "US",
  "america": "US",
  "uk": "GB",
  "u.k.": "GB",
  "great britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "northern ireland": "GB",
  "deutschland": "DE",
  "españa": "ES",
  "espana": "ES",
  "schweiz": "CH",
  "suisse": "CH",
  "österreich": "AT",
  "osterreich": "AT",
  "polska": "PL",
  "česko": "CZ",
  "cesko": "CZ",
  "south korea": "KR",
  "republic of korea": "KR",
  "korea": "KR",
  "viet nam": "VN",
  "russia": "RU",
  "russian federation": "RU",
  "uae": "AE",
  "u.a.e.": "AE",
  "south africa republic": "ZA",
  "rsa": "ZA",
};

const BY_ISO2  = new Map(COUNTRIES.map((c) => [c.iso2, c]));
const BY_NAME  = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));
const BY_NUM   = new Map(COUNTRIES.map((c) => [c.isoNum, c]));

/** Normalize a free-form country string to a canonical record.
 *  Returns `null` when the input doesn't match anything we know. */
export function normalizeCountry(input: string | null | undefined): CountryRecord | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && BY_ISO2.has(upper)) return BY_ISO2.get(upper)!;
  const lower = raw.toLowerCase();
  if (BY_NAME.has(lower)) return BY_NAME.get(lower)!;
  const aliased = ALIASES[lower];
  if (aliased && BY_ISO2.has(aliased)) return BY_ISO2.get(aliased)!;
  return null;
}

/** Look up by 3-digit numeric code (the form world-atlas TopoJSON uses). */
export function countryByIsoNum(num: string): CountryRecord | null {
  return BY_NUM.get(num) ?? null;
}

/** Convert ISO2 to a flag emoji using regional-indicator code points. */
export function flagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "";
  const A = 127397; // 0x1F1E6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => c.charCodeAt(0) + A));
}
