import type { Rule, Tx, View } from './types';

// Case- and accent-insensitive text, so "ZABKA" matches "Żabka"
export function norm(s: string | null | undefined): string {
  // NFD doesn't split ł, so fold it by hand ("Małpka" matches "MALPKA")
  return (s ?? '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Payment processors in front of the real place: "PAYPAL *SPOTIFY", "SUMUP *KAWIARNIA"
const PROCESSOR =
  /^(?:SQ|SUMUP|PAYPAL|PP|GOOGLE|APPLE PAY|APPLE\.COM\/BILL|PAYU|ZTL|IZ|DLO|TST|P24)\s*\*\s*/i;

// The keyword a rule should use for a place. Raw bank strings like "SQ *BUNKIER SZTUKI" or
// "ZABKA Z4754 K.2" become "Bunkier" / "Zabka"; places typed by hand are kept as they are.
export function kwOf(place: string): string {
  const p = place ?? '';
  if (/[a-zżźćńółęąś]/.test(p)) return p.trim();
  const rest = p.replace(PROCESSOR, '');
  // the first real word: "BOLT.EU/O/2310081234" → "Bolt", "ZABKA Z4754" → "Zabka"
  const w =
    rest
      .split(/[\s*./\\#_]+/)
      .map((x) => x.replace(/\d.*$/, ''))
      .find((x) => /^[A-ZŻŹĆŃÓŁĘĄŚ]{3,}$/i.test(x)) || p.trim();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// The same matching as autoCategory() in the script: first rule whose keyword is in the place
export function ruleFor(rules: Rule[], place: string): Rule | undefined {
  if (!place) return undefined;
  return rules.find((r) => r.cat && placeMatches(r.kw, place));
}

export function placeMatches(kw: string, place: string): boolean {
  const k = norm(kw).trim();
  return k.length >= 2 && norm(place).includes(k);
}

// Records whose place contains the keyword (expenses and income)
export function ruleMatches(view: View, kw: string): Tx[] {
  return view.tx.filter((t) => t.merchant && placeMatches(kw, t.merchant));
}

// Imported without a category (e.g. Apple Pay with no matching rule)
export function needsReview(t: Tx): boolean {
  return !t.category;
}
