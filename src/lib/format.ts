export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SYMBOLS: Record<string, [string, string]> = {
  USD: ['$', ''],
  USDT: ['', ' USDT'],
  EUR: ['€', ''],
  GBP: ['£', ''],
  PLN: ['', ' zł'],
  UAH: ['', ' ₴'],
};

export function money(v: number | null | undefined, decimals = 0): string {
  if (v == null || Number.isNaN(v)) return '–';
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${v < 0 ? '−' : ''}$${abs}`;
}

export function signedMoney(v: number): string {
  return `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
}

export function native(v: number, currency: string): string {
  const [pre, post] = SYMBOLS[currency] ?? ['', ` ${currency}`];
  const decimals = currency === 'UAH' && Number.isInteger(v) ? 0 : 2;
  const n = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
  return `${v < 0 ? '−' : ''}${pre}${n}${post}`;
}

export function monthName(ym: string): string {
  return MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
}

export function shortDay(date: string): string {
  return `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function time(date: string): string {
  return date.length >= 16 ? date.slice(11, 16) : '';
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 864e5);
}

// "Today", "Yesterday", "Mon, Oct 5"
export function dayHeading(date: string, today: string): string {
  const d = daysBetween(date.slice(0, 10), today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  const wd = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();
  const y = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${WEEKDAYS[wd]}, ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}${y}`;
}

// "Today", "Yesterday", "Oct 5"
export function shortDate(date: string, today: string): string {
  if (!date) return 'never';
  const d = daysBetween(date.slice(0, 10), today);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  const y = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}${y}`;
}

const PREFIX: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
const SUFFIX: Record<string, string> = { PLN: 'zł', UAH: '₴' };
export const CURRENCY_SIGN: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PLN: 'zł',
  UAH: '₴',
  USDT: '₮',
};

// "$656", "23.40 zł", "− 1,289 ₴". Cents only when there are any (and the user wants them).
export function fmt(
  v: number,
  currency: string,
  sign: '' | '+' | '−' = '',
  cents = true,
  hidden = false,
): string {
  if (!Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  const d = cents && Math.round(abs * 100) % 100 !== 0 ? 2 : 0;
  const n = hidden
    ? '•••'
    : abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const p = sign ? `${sign} ` : '';
  const pre = PREFIX[currency];
  if (pre) return `${p}${pre}${n}`;
  return `${p}${n} ${SUFFIX[currency] ?? currency}`;
}

export function age(updated: string, today: string): string {
  if (!updated) return 'never updated';
  const d = daysBetween(updated.slice(0, 10), today);
  if (d <= 0) return 'updated today';
  if (d === 1) return 'updated yesterday';
  return `updated ${d} days ago`;
}

// Local "now" as yyyy-MM-ddTHH:mm for date inputs
export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function parseAmount(raw: string): number {
  const s = raw.replace(/[\s ]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let num = s;
  if (lastComma > -1 && lastDot > -1) {
    num = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    num = s.replace(',', '.');
  }
  const n = Number.parseFloat(num);
  return Number.isFinite(n) ? n : Number.NaN;
}
