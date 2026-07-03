// Per-user currency, derived from the WhatsApp number's country calling code.
// No conversion — each user's amounts are simply displayed in their own currency.

export interface Currency {
  symbol: string; // for WhatsApp text (unicode is fine)
  pdf: string; // PDF-safe form (Helvetica/WinAnsi has no ₹/₨/৳ glyph)
}

const DEFAULT: Currency = { symbol: '₹', pdf: 'Rs.' };

// Country calling code -> currency.
const MAP: Record<string, Currency> = {
  '91': { symbol: '₹', pdf: 'Rs. ' }, // India
  '44': { symbol: '£', pdf: '£' }, // UK
  '1': { symbol: '$', pdf: '$' }, // US / Canada
  '971': { symbol: 'AED ', pdf: 'AED ' }, // UAE
  '61': { symbol: 'A$', pdf: 'A$' }, // Australia
  '65': { symbol: 'S$', pdf: 'S$' }, // Singapore
  '81': { symbol: '¥', pdf: '¥' }, // Japan
  '49': { symbol: '€', pdf: '€' }, // Germany
  '33': { symbol: '€', pdf: '€' }, // France
  '39': { symbol: '€', pdf: '€' }, // Italy
  '34': { symbol: '€', pdf: '€' }, // Spain
  '92': { symbol: '₨', pdf: 'Rs. ' }, // Pakistan
  '94': { symbol: '₨', pdf: 'Rs. ' }, // Sri Lanka
  '977': { symbol: '₨', pdf: 'Rs. ' }, // Nepal
  '880': { symbol: '৳', pdf: 'BDT ' }, // Bangladesh
};

// Longest calling code first, since codes vary in length (1–3 digits).
const CODES = Object.keys(MAP).sort((a, b) => b.length - a.length);

export function currencyFor(phone: string): Currency {
  const code = CODES.find((c) => phone.startsWith(c));
  return code ? MAP[code]! : DEFAULT;
}

/** Shorthand: just the WhatsApp display symbol for a user. */
export function symbolFor(phone: string): string {
  return currencyFor(phone).symbol;
}
