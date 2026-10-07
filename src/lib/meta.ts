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

// Banks, payment apps and exchanges with a logo. `match` finds them by account name when the
// sheet doesn't name a website; `currency` is the usual one for a new account.
export type BankRegion = 'Poland' | 'Ukraine' | 'Global' | 'Crypto';
export interface Bank {
  name: string;
  domain: string;
  region: BankRegion;
  currency?: string;
  match: RegExp;
}

export const BANKS: Bank[] = [
  { name: 'PKO BP', domain: 'pkobp.pl', region: 'Poland', currency: 'PLN', match: /pko/i },
  { name: 'mBank', domain: 'mbank.pl', region: 'Poland', currency: 'PLN', match: /mbank/i },
  { name: 'Erste', domain: 'santander.pl', region: 'Poland', currency: 'PLN', match: /santander|erste/i },
  { name: 'ING', domain: 'ing.pl', region: 'Poland', currency: 'PLN', match: /^ing\b/i },
  { name: 'Pekao', domain: 'pekao.com.pl', region: 'Poland', currency: 'PLN', match: /pekao/i },
  {
    name: 'Millennium',
    domain: 'bankmillennium.pl',
    region: 'Poland',
    currency: 'PLN',
    match: /millennium/i,
  },
  { name: 'Alior', domain: 'aliorbank.pl', region: 'Poland', currency: 'PLN', match: /alior/i },
  {
    name: 'Credit Agricole',
    domain: 'credit-agricole.pl',
    region: 'Poland',
    currency: 'PLN',
    match: /agricole/i,
  },
  { name: 'BNP Paribas', domain: 'bnpparibas.pl', region: 'Poland', currency: 'PLN', match: /bnp/i },
  { name: 'VeloBank', domain: 'velobank.pl', region: 'Poland', currency: 'PLN', match: /velo/i },
  { name: 'monobank', domain: 'monobank.ua', region: 'Ukraine', currency: 'UAH', match: /mono/i },
  {
    name: 'PrivatBank',
    domain: 'privatbank.ua',
    region: 'Ukraine',
    currency: 'UAH',
    match: /privat|приват/i,
  },
  { name: 'Oschadbank', domain: 'oschadbank.ua', region: 'Ukraine', currency: 'UAH', match: /oschad|ощад/i },
  { name: 'PUMB', domain: 'pumb.ua', region: 'Ukraine', currency: 'UAH', match: /pumb|пумб/i },
  { name: 'A-Bank', domain: 'a-bank.com.ua', region: 'Ukraine', currency: 'UAH', match: /a-?bank|а-?банк/i },
  { name: 'Sense Bank', domain: 'sensebank.ua', region: 'Ukraine', currency: 'UAH', match: /sense/i },
  { name: 'Raiffeisen', domain: 'raiffeisen.ua', region: 'Ukraine', currency: 'UAH', match: /raiff|райф/i },
  { name: 'izibank', domain: 'izibank.com.ua', region: 'Ukraine', currency: 'UAH', match: /izi/i },
  { name: 'Wise', domain: 'wise.com', region: 'Global', currency: 'USD', match: /wise/i },
  { name: 'Revolut', domain: 'revolut.com', region: 'Global', currency: 'PLN', match: /revolut/i },
  { name: 'PayPal', domain: 'paypal.com', region: 'Global', currency: 'USD', match: /paypal/i },
  { name: 'N26', domain: 'n26.com', region: 'Global', currency: 'EUR', match: /n26/i },
  { name: 'Payoneer', domain: 'payoneer.com', region: 'Global', currency: 'USD', match: /payoneer/i },
  { name: 'Zen', domain: 'zen.com', region: 'Global', currency: 'PLN', match: /^zen\b/i },
  { name: 'Binance', domain: 'binance.com', region: 'Crypto', currency: 'USDT', match: /binance/i },
  { name: 'Bybit', domain: 'bybit.com', region: 'Crypto', currency: 'USDT', match: /bybit/i },
  { name: 'OKX', domain: 'okx.com', region: 'Crypto', currency: 'USDT', match: /okx/i },
  { name: 'WhiteBIT', domain: 'whitebit.com', region: 'Crypto', currency: 'USDT', match: /whitebit/i },
  { name: 'Coinbase', domain: 'coinbase.com', region: 'Crypto', currency: 'USDT', match: /coinbase/i },
  { name: 'Kraken', domain: 'kraken.com', region: 'Crypto', currency: 'USDT', match: /kraken/i },
  { name: 'KuCoin', domain: 'kucoin.com', region: 'Crypto', currency: 'USDT', match: /kucoin/i },
  { name: 'Bitget', domain: 'bitget.com', region: 'Crypto', currency: 'USDT', match: /bitget/i },
  { name: 'MEXC', domain: 'mexc.com', region: 'Crypto', currency: 'USDT', match: /mexc/i },
  { name: 'Trust Wallet', domain: 'trustwallet.com', region: 'Crypto', currency: 'USDT', match: /trust/i },
  { name: 'MetaMask', domain: 'metamask.io', region: 'Crypto', currency: 'USDT', match: /metamask/i },
];
export const BANK_REGIONS: BankRegion[] = ['Poland', 'Ukraine', 'Global', 'Crypto'];

export function accountDomain(name: string, domain?: string): string {
  if (domain) return domain;
  return BANKS.find((b) => b.match.test(name))?.domain ?? '';
}

// Logo sources, best first; the avatar moves to the next one when a picture fails to load.
// 1. Brandfetch Logo API (free, 1M requests a month): https://docs.brandfetch.com/docs/logo-api/
//    The client ID is public by design; Brandfetch only serves it to pages that embed the logos.
// 2. Banks in BANKS ship their App Store icon (256 px, public/logos, made by scripts/fetch-logos.mjs).
// 3. Any other website: its own large icon through Google's icon service.
export const BRANDFETCH_ID = '1id8eyWTAu83fmiC8M5';
const LOCAL_LOGOS = new Set(BANKS.map((b) => b.domain));

export function logoUrls(domain: string): string[] {
  if (!domain) return [];
  const out: string[] = [];
  if (BRANDFETCH_ID) {
    out.push(
      `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/w/256/h/256/fallback/404/icon?c=${BRANDFETCH_ID}`,
    );
  }
  if (LOCAL_LOGOS.has(domain)) out.push(`./logos/${domain}.jpg`);
  else
    out.push(
      `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(domain)}&size=256`,
    );
  return out;
}

export const logoUrl = (domain: string): string => logoUrls(domain)[0] ?? '';

// People (debts and loans) get a blobatar instead of a logo
export const isPerson = (type?: string) => type === 'You owe' || type === 'Owed to you';
