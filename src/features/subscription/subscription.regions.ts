// PPP discount tiers by ISO 3166-1 alpha-2 country code.
// "full" = no discount, "ppp60" = ~60% off.

const PPP_60_COUNTRIES = new Set([
  "AR",
  "BD",
  "BO",
  "BR",
  "BG",
  "CO",
  "CR",
  "EG",
  "GH",
  "GT",
  "HN",
  "IN",
  "ID",
  "KE",
  "MY",
  "MX",
  "MA",
  "NG",
  "PK",
  "PE",
  "PH",
  "PL",
  "RO",
  "RS",
  "ZA",
  "LK",
  "TH",
  "TN",
  "TR",
  "UA",
  "UZ",
  "VN",
]);

export type PppTier = "full" | "ppp60";

export function getPppTier(countryCode: string | null | undefined): PppTier {
  if (!countryCode) return "full";
  return PPP_60_COUNTRIES.has(countryCode.toUpperCase()) ? "ppp60" : "full";
}
