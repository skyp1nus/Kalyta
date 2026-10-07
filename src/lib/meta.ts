import type { Account } from './types';

// Colors and icons from the Kalyta 2.0 design
export interface CategoryMeta {
  color: string;
  icon: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  Food: { color: '#ff9f0a', icon: 'restaurant' },
  Transport: { color: '#0a84ff', icon: 'directions_bus' },
  Home: { color: '#32ade6', icon: 'home' },
  Lifestyle: { color: '#ff375f', icon: 'local_mall' },
  Subscriptions: { color: '#bf5af2', icon: 'autorenew' },
  Business: { color: '#5e5ce6', icon: 'work' },
  Other: { color: '#8e8e93', icon: 'more_horiz' },
};
export const INCOME_META: CategoryMeta = { color: '#30d158', icon: 'south_west' };
export const TRANSFER_META: CategoryMeta = { color: '#8e8e93', icon: 'swap_horiz' };
export const ADJUST_META: CategoryMeta = { color: '#636366', icon: 'tune' };
const EXTRA = ['#ff9f0a', '#0a84ff', '#32ade6', '#ff375f', '#bf5af2', '#5e5ce6', '#30b0c7', '#a2845e'];

export function categoryMeta(category: string, income: string): CategoryMeta {
  if (category === income) return INCOME_META;
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

export const CURRENCY_NAMES: Record<string, string> = {
  PLN: 'Polish złoty',
  USD: 'US dollar',
  UAH: 'Ukrainian hryvnia',
  EUR: 'Euro',
  USDT: 'Tether',
};
export const CURRENCIES = ['PLN', 'USD', 'UAH', 'EUR', 'USDT'];

const ACCOUNT_COLORS: Array<[RegExp, string]> = [
  [/wise/i, '#2fb56a'],
  [/bybit|binance/i, '#f5a623'],
  [/mono/i, '#5e5ce6'],
  [/revolut/i, '#0a84ff'],
  [/cash|готів/i, '#7c7c82'],
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export type AccountGroup = 'Banks' | 'Crypto' | 'Cash' | 'Owed to you' | 'Debts';
export const GROUPS: AccountGroup[] = ['Banks', 'Crypto', 'Cash', 'Owed to you', 'Debts'];

export const isDebt = (a: Account) => a.type === 'You owe';
export const isLoan = (a: Account) => a.type === 'Owed to you';

export function accountGroup(a: Account): AccountGroup {
  if (isDebt(a)) return 'Debts';
  if (isLoan(a)) return 'Owed to you';
  if (/^USD[TC]$|BTC|ETH/i.test(a.currency) || /bybit|binance|crypto/i.test(a.name)) return 'Crypto';
  if (/cash|готів/i.test(a.name)) return 'Cash';
  return 'Banks';
}

export interface AccountLook {
  color: string;
  letter: string;
  icon: string;
}

export function accountLook(name: string, type = 'Account'): AccountLook {
  const cash = /cash|готів/i.test(name);
  const color =
    type === 'You owe'
      ? '#bf5af2'
      : (ACCOUNT_COLORS.find(([re]) => re.test(name))?.[1] ?? EXTRA[hash(name) % EXTRA.length]);
  return { color, letter: cash ? '' : (name.trim()[0] ?? '?').toUpperCase(), icon: cash ? 'payments' : '' };
}

// Websites for logos when the sheet doesn't name one
const KNOWN_DOMAINS: Array<[RegExp, string]> = [
  [/wise/i, 'wise.com'],
  [/bybit/i, 'bybit.com'],
  [/binance/i, 'binance.com'],
  [/mono/i, 'monobank.ua'],
  [/revolut/i, 'revolut.com'],
  [/privat/i, 'privatbank.ua'],
  [/pko/i, 'pkobp.pl'],
  [/mbank/i, 'mbank.pl'],
  [/santander/i, 'santander.pl'],
  [/paypal/i, 'paypal.com'],
];

export const BANKS: Array<{ name: string; domain: string }> = [
  { name: 'Wise', domain: 'wise.com' },
  { name: 'Revolut', domain: 'revolut.com' },
  { name: 'monobank', domain: 'monobank.ua' },
  { name: 'PrivatBank', domain: 'privatbank.ua' },
  { name: 'Bybit', domain: 'bybit.com' },
  { name: 'Binance', domain: 'binance.com' },
  { name: 'PKO BP', domain: 'pkobp.pl' },
  { name: 'mBank', domain: 'mbank.pl' },
  { name: 'Santander', domain: 'santander.pl' },
  { name: 'ING', domain: 'ing.pl' },
  { name: 'PayPal', domain: 'paypal.com' },
];

export function accountDomain(name: string, domain?: string): string {
  if (domain) return domain;
  return KNOWN_DOMAINS.find(([re]) => re.test(name))?.[1] ?? '';
}

export function logoUrl(domain: string): string {
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : '';
}

// People (debts and loans) get a blobatar instead of a logo
export const isPerson = (type?: string) => type === 'You owe' || type === 'Owed to you';
