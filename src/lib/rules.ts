import type { Rule, Tx, View } from './types';

// Case- and accent-insensitive text, so "ZABKA" matches "Żabka"
export function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// The keyword a rule should use for a place. Raw bank strings like "SQ *BUNKIER SZTUKI" or
// "ZABKA Z4754 K.2" become "Bunkier" / "Zabka"; places typed by hand are kept as they are.
export function kwOf(place: string): string {
  const p = place ?? '';
  if (/[a-zżźćńółęąś]/.test(p)) return p.trim();
  const w =
    p
      .replace(/^(SQ \*|APPLE PAY \*?)/i, '')
      .split(/[\s*]+/)
      .find((x) => /^[A-ZŻŹĆŃÓŁĘĄŚ]{3,}/i.test(x)) || p;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function ruleFor(rules: Rule[], place: string): Rule | undefined {
  const n = norm(place);
  if (n.length < 3) return undefined;
  return rules.find((r) => n.includes(norm(r.kw)));
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
