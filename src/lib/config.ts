/** Deployment-specific settings, read once from the environment. */

export const config = {
  companyName: process.env.COMPANY_NAME ?? 'Stockroom',
  currency: (process.env.CURRENCY ?? 'USD').toUpperCase(),
  taxRateBps: clampInt(process.env.TAX_RATE_BPS, 0, 0, 10_000),
  saleLocationCode: process.env.SALE_LOCATION_CODE ?? 'COUNTER',
} as const;

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
