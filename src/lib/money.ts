import { config } from '@/lib/config';

/** All money is stored as integer minor units (cents) to avoid float drift. */

export function formatMoney(cents: number, currency = config.currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** Parses "12.34", "1,234.5" or "12" into 1234, 123450, 1200 cents. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[,\s]/g, '').replace(/^[$€£¥₱]/, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const digits = whole.replace('-', '');
  const cents = Number(digits) * 100 + Number(frac.padEnd(2, '0'));
  return sign * cents;
}

export function formatQty(qty: number, unit = 'ea'): string {
  return unit === 'ea' ? String(qty) : `${qty} ${unit}`;
}
