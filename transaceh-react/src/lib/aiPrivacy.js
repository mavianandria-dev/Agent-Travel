/* Redaksi PII sebelum ringkasan tiket dikirim ke penyedia AI. */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?62[\s.-]?|0)8(?:[\s.-]?\d){7,13}/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

export function redactPII(value, max = 240) {
  return String(value ?? '')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[no. HP]')
    .replace(CARD, '[data sensitif]')
    .slice(0, max);
}
