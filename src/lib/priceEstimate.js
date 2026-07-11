// Rough, manually-maintained estimates — NOT live data. Update whenever they drift
// noticeably; there is no live FX/shipping API by design (see design spec §2 non-goals).
// Rates as of 2026-07.
export const CURRENCY_TO_KES = {
  GBP: 205,
  USD: 130,
  EUR: 150,
  RUB: 1.4,
  ZAR: 7.5,
  KES: 1,
}

export const SHIPPING_ESTIMATE_KES = 3500 // flat rough per-parcel estimate, any source

export function estimateLandedKes(price, currencyCode) {
  if (price == null || currencyCode == null) return null
  const rate = CURRENCY_TO_KES[currencyCode.toUpperCase()]
  if (rate == null) return null
  return price * rate + SHIPPING_ESTIMATE_KES
}
