// ISO 4217 currency catalog for the shop-profile select.
//
// Phase 4 (transformation) replaces the 5-entry currency list (USD /
// CAD / EUR / GBP / AUD) with the full ISO 4217 standard. Grouped into
// two tiers:
//
//   COMMON_CURRENCIES — frequent choices bubbled to the top of the
//                       select so operators don't hunt for USD.
//   ALL_CURRENCIES    — flat ISO 4217 list (including COMMON). Dropped
//                       deprecated / fund / metal codes (XAU, XDR,
//                       ZWL, etc.) since they can't denominate a
//                       sign-shop invoice in any meaningful sense.
//
// `Tenant.currency` stays a 3-char string; the select's value attribute
// is the ISO alpha code ("USD"). Symbols are rendered by Intl
// formatters at display time, not stored, so this file is label-only.

export interface CurrencyOption {
  /** ISO 4217 alpha-3 code. */
  value: string;
  /** Plain-English name — e.g. "US dollar". */
  label: string;
  /** Symbol when unambiguous — e.g. "$". Optional; not every currency has one. */
  symbol?: string;
}

export const COMMON_CURRENCIES: CurrencyOption[] = [
  { value: "USD", label: "US dollar",          symbol: "$" },
  { value: "EUR", label: "Euro",               symbol: "€" },
  { value: "GBP", label: "British pound",      symbol: "£" },
  { value: "CAD", label: "Canadian dollar",    symbol: "C$" },
  { value: "AUD", label: "Australian dollar",  symbol: "A$" },
  { value: "NZD", label: "New Zealand dollar", symbol: "NZ$" },
];

/** Full ISO 4217 alpha-3 catalog (common + long tail). Alphabetical
 *  within the long-tail section so callers can present it as a single
 *  optgroup with predictable order. */
export const ALL_CURRENCIES: CurrencyOption[] = [
  ...COMMON_CURRENCIES,
  { value: "AED", label: "UAE dirham" },
  { value: "AFN", label: "Afghan afghani" },
  { value: "ALL", label: "Albanian lek" },
  { value: "AMD", label: "Armenian dram" },
  { value: "ANG", label: "Netherlands Antillean guilder" },
  { value: "AOA", label: "Angolan kwanza" },
  { value: "ARS", label: "Argentine peso" },
  { value: "AWG", label: "Aruban florin" },
  { value: "AZN", label: "Azerbaijani manat" },
  { value: "BAM", label: "Bosnia-Herzegovina convertible mark" },
  { value: "BBD", label: "Barbadian dollar" },
  { value: "BDT", label: "Bangladeshi taka" },
  { value: "BGN", label: "Bulgarian lev" },
  { value: "BHD", label: "Bahraini dinar" },
  { value: "BIF", label: "Burundian franc" },
  { value: "BMD", label: "Bermudian dollar" },
  { value: "BND", label: "Brunei dollar" },
  { value: "BOB", label: "Bolivian boliviano" },
  { value: "BRL", label: "Brazilian real",      symbol: "R$" },
  { value: "BSD", label: "Bahamian dollar" },
  { value: "BTN", label: "Bhutanese ngultrum" },
  { value: "BWP", label: "Botswana pula" },
  { value: "BYN", label: "Belarusian ruble" },
  { value: "BZD", label: "Belize dollar" },
  { value: "CDF", label: "Congolese franc" },
  { value: "CHF", label: "Swiss franc",          symbol: "CHF" },
  { value: "CLP", label: "Chilean peso" },
  { value: "CNY", label: "Chinese yuan",         symbol: "¥" },
  { value: "COP", label: "Colombian peso" },
  { value: "CRC", label: "Costa Rican colón" },
  { value: "CUP", label: "Cuban peso" },
  { value: "CVE", label: "Cape Verdean escudo" },
  { value: "CZK", label: "Czech koruna" },
  { value: "DJF", label: "Djiboutian franc" },
  { value: "DKK", label: "Danish krone" },
  { value: "DOP", label: "Dominican peso" },
  { value: "DZD", label: "Algerian dinar" },
  { value: "EGP", label: "Egyptian pound" },
  { value: "ERN", label: "Eritrean nakfa" },
  { value: "ETB", label: "Ethiopian birr" },
  { value: "FJD", label: "Fijian dollar" },
  { value: "FKP", label: "Falkland Islands pound" },
  { value: "GEL", label: "Georgian lari" },
  { value: "GHS", label: "Ghanaian cedi" },
  { value: "GIP", label: "Gibraltar pound" },
  { value: "GMD", label: "Gambian dalasi" },
  { value: "GNF", label: "Guinean franc" },
  { value: "GTQ", label: "Guatemalan quetzal" },
  { value: "GYD", label: "Guyanese dollar" },
  { value: "HKD", label: "Hong Kong dollar",     symbol: "HK$" },
  { value: "HNL", label: "Honduran lempira" },
  { value: "HRK", label: "Croatian kuna" },
  { value: "HTG", label: "Haitian gourde" },
  { value: "HUF", label: "Hungarian forint" },
  { value: "IDR", label: "Indonesian rupiah" },
  { value: "ILS", label: "Israeli new shekel",   symbol: "₪" },
  { value: "INR", label: "Indian rupee",         symbol: "₹" },
  { value: "IQD", label: "Iraqi dinar" },
  { value: "IRR", label: "Iranian rial" },
  { value: "ISK", label: "Icelandic króna" },
  { value: "JMD", label: "Jamaican dollar" },
  { value: "JOD", label: "Jordanian dinar" },
  { value: "JPY", label: "Japanese yen",         symbol: "¥" },
  { value: "KES", label: "Kenyan shilling" },
  { value: "KGS", label: "Kyrgyzstani som" },
  { value: "KHR", label: "Cambodian riel" },
  { value: "KMF", label: "Comoran franc" },
  { value: "KPW", label: "North Korean won" },
  { value: "KRW", label: "South Korean won",     symbol: "₩" },
  { value: "KWD", label: "Kuwaiti dinar" },
  { value: "KYD", label: "Cayman Islands dollar" },
  { value: "KZT", label: "Kazakhstani tenge" },
  { value: "LAK", label: "Laotian kip" },
  { value: "LBP", label: "Lebanese pound" },
  { value: "LKR", label: "Sri Lankan rupee" },
  { value: "LRD", label: "Liberian dollar" },
  { value: "LSL", label: "Lesotho loti" },
  { value: "LYD", label: "Libyan dinar" },
  { value: "MAD", label: "Moroccan dirham" },
  { value: "MDL", label: "Moldovan leu" },
  { value: "MGA", label: "Malagasy ariary" },
  { value: "MKD", label: "Macedonian denar" },
  { value: "MMK", label: "Myanmar kyat" },
  { value: "MNT", label: "Mongolian tögrög" },
  { value: "MOP", label: "Macanese pataca" },
  { value: "MRU", label: "Mauritanian ouguiya" },
  { value: "MUR", label: "Mauritian rupee" },
  { value: "MVR", label: "Maldivian rufiyaa" },
  { value: "MWK", label: "Malawian kwacha" },
  { value: "MXN", label: "Mexican peso",         symbol: "$" },
  { value: "MYR", label: "Malaysian ringgit" },
  { value: "MZN", label: "Mozambican metical" },
  { value: "NAD", label: "Namibian dollar" },
  { value: "NGN", label: "Nigerian naira" },
  { value: "NIO", label: "Nicaraguan córdoba" },
  { value: "NOK", label: "Norwegian krone" },
  { value: "NPR", label: "Nepalese rupee" },
  { value: "OMR", label: "Omani rial" },
  { value: "PAB", label: "Panamanian balboa" },
  { value: "PEN", label: "Peruvian sol" },
  { value: "PGK", label: "Papua New Guinean kina" },
  { value: "PHP", label: "Philippine peso",      symbol: "₱" },
  { value: "PKR", label: "Pakistani rupee" },
  { value: "PLN", label: "Polish złoty" },
  { value: "PYG", label: "Paraguayan guarani" },
  { value: "QAR", label: "Qatari riyal" },
  { value: "RON", label: "Romanian leu" },
  { value: "RSD", label: "Serbian dinar" },
  { value: "RUB", label: "Russian ruble",        symbol: "₽" },
  { value: "RWF", label: "Rwandan franc" },
  { value: "SAR", label: "Saudi riyal" },
  { value: "SBD", label: "Solomon Islands dollar" },
  { value: "SCR", label: "Seychellois rupee" },
  { value: "SDG", label: "Sudanese pound" },
  { value: "SEK", label: "Swedish krona" },
  { value: "SGD", label: "Singapore dollar",     symbol: "S$" },
  { value: "SHP", label: "Saint Helena pound" },
  { value: "SLE", label: "Sierra Leonean leone" },
  { value: "SOS", label: "Somali shilling" },
  { value: "SRD", label: "Surinamese dollar" },
  { value: "SSP", label: "South Sudanese pound" },
  { value: "STN", label: "São Tomé & Príncipe dobra" },
  { value: "SYP", label: "Syrian pound" },
  { value: "SZL", label: "Swazi lilangeni" },
  { value: "THB", label: "Thai baht",            symbol: "฿" },
  { value: "TJS", label: "Tajikistani somoni" },
  { value: "TMT", label: "Turkmenistani manat" },
  { value: "TND", label: "Tunisian dinar" },
  { value: "TOP", label: "Tongan paʻanga" },
  { value: "TRY", label: "Turkish lira",         symbol: "₺" },
  { value: "TTD", label: "Trinidad & Tobago dollar" },
  { value: "TWD", label: "New Taiwan dollar",    symbol: "NT$" },
  { value: "TZS", label: "Tanzanian shilling" },
  { value: "UAH", label: "Ukrainian hryvnia",    symbol: "₴" },
  { value: "UGX", label: "Ugandan shilling" },
  { value: "UYU", label: "Uruguayan peso" },
  { value: "UZS", label: "Uzbekistani som" },
  { value: "VES", label: "Venezuelan bolívar" },
  { value: "VND", label: "Vietnamese đồng",      symbol: "₫" },
  { value: "VUV", label: "Vanuatu vatu" },
  { value: "WST", label: "Samoan tālā" },
  { value: "XAF", label: "Central African CFA franc" },
  { value: "XCD", label: "East Caribbean dollar" },
  { value: "XOF", label: "West African CFA franc" },
  { value: "XPF", label: "CFP franc" },
  { value: "YER", label: "Yemeni rial" },
  { value: "ZAR", label: "South African rand",   symbol: "R" },
  { value: "ZMW", label: "Zambian kwacha" },
];

/** True if the 3-letter code is in our ISO 4217 catalog. */
export function isKnownCurrency(code: string): boolean {
  const upper = code.toUpperCase();
  return ALL_CURRENCIES.some((c) => c.value === upper);
}
