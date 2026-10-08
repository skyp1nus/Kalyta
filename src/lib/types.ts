// Rows exactly as the Apps Script API sends them
export type TxRow = [
  id: string,
  date: string,
  amount: number,
  currency: string,
  merchant: string,
  account: string,
  category: string,
  note: string,
  source: string,
  usd: number | null,
];
export type TransferRow = [
  id: string,
  date: string,
  from: string,
  sent: number,
  fromCurrency: string,
  to: string,
  received: number,
  toCurrency: string,
  note: string,
];

export interface Account {
  name: string;
  type: string; // 'Account' | 'Owed to you' | 'You owe'
  currency: string;
  balance: number;
  updated: string;
  checked?: string; // last time the balance was entered by hand
  domain?: string; // website for the logo, e.g. wise.com
  usd: number | null;
}

// Monthly limits in USD; total is the limit for all spending
export interface Budgets {
  total: number;
  cats: Record<string, number>;
}

export type Cadence = 'weekly' | 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  next: string; // yyyy-MM-dd
  account: string;
  category: string;
  paused: boolean;
  prev: number | null; // the amount before the last price change
  pending?: boolean;
}

// Place contains kw (ignoring case and accents) -> category
export interface Rule {
  kw: string;
  cat: string;
}

// [id, date, account, change, currency] as the API sends them
export type AdjustmentRow = [id: string, date: string, account: string, change: number, currency: string];

// A balance correction that isn't spending or income
export interface Adjustment {
  id: string;
  date: string;
  account: string;
  change: number;
  currency: string;
  pending?: boolean;
  failed?: string;
}

export interface ServerData {
  tx: TxRow[];
  transfers: TransferRow[];
  accounts: Account[];
  adjustments?: AdjustmentRow[];
  rates?: Record<string, number>; // USD per unit
  sheetName?: string;
  budgets?: Budgets;
  subscriptions?: Subscription[];
  rules?: Array<[kw: string, cat: string]>;
  categories: string[];
  incomeCategories?: string[];
  categoryLooks?: Array<[name: string, kind: string, emoji: string, color: string]>;
  colors: string[];
  income: string;
  base: string;
  today: string;
  fetchedAt: string;
}

export interface Tx {
  id: string;
  date: string; // yyyy-MM-ddTHH:mm in the sheet's time zone
  amount: number;
  currency: string;
  merchant: string;
  account: string;
  category: string;
  note: string;
  source: string;
  usd: number | null;
  pending?: boolean;
  failed?: string;
}

export interface Transfer {
  id: string;
  date: string;
  from: string;
  sent: number;
  fromCurrency: string;
  to: string;
  received: number;
  toCurrency: string;
  note: string;
  pending?: boolean;
  failed?: string;
}

// What the forms send
export interface TxInput {
  id: string;
  kind: 'expense' | 'income';
  date: string;
  amount: string;
  currency: string;
  merchant: string;
  account: string;
  category: string;
  note: string;
}

export interface TransferInput {
  id: string;
  date: string;
  from: string;
  sent: string;
  fromCurrency: string;
  to: string;
  received: string;
  toCurrency: string;
  note: string;
}

export type OpBody =
  | { action: 'add'; tx: TxInput }
  | { action: 'update'; id: string; tx: TxInput }
  | { action: 'delete'; id: string }
  | { action: 'transfer'; tr: TransferInput }
  | { action: 'updateTransfer'; id: string; tr: TransferInput }
  | { action: 'deleteTransfer'; id: string }
  | { action: 'balance'; account: string; balance: string; mode?: 'adjust' | 'check'; id?: string }
  | { action: 'deleteAdjustment'; id: string }
  | { action: 'repair' }
  | { action: 'budgets'; total: number; cats: Record<string, number> }
  | { action: 'subscription'; sub: Omit<Subscription, 'pending'> }
  | { action: 'deleteSubscription'; id: string }
  | { action: 'rule'; kw: string; cat: string; past?: boolean; replaces?: string }
  | { action: 'deleteRule'; kw: string }
  | { action: 'accountDomain'; account: string; domain: string }
  | { action: 'addAccount'; acc: NewAccount }
  | { action: 'deleteAccount'; account: string }
  | { action: 'category'; cat: { name: string; kind: 'expense' | 'income'; emoji: string; color: string } }
  | { action: 'deleteCategory'; name: string };

export type AccountType = 'Account' | 'Owed to you' | 'You owe';

// What the "New account" sheet sends
export interface NewAccount {
  name: string;
  type: AccountType;
  currency: string;
  balance: string;
  domain: string;
}

export type Op = OpBody & {
  opId: string;
  createdAt: number;
  notBefore?: number; // held back until then so the user can undo
  error?: string; // set when the server rejected it; stays until retried or discarded
};

export interface Settings {
  url: string;
  key: string;
}

export interface View {
  tx: Tx[];
  transfers: Transfer[];
  accounts: Account[];
  adjustments: Adjustment[];
  rates: Record<string, number>; // USD per unit
  fetchedAt: string;
  sheetName: string;
  budgets: Budgets;
  subscriptions: Subscription[];
  rules: Rule[];
  categories: string[]; // expense categories
  incomeCategories: string[];
  categoryLooks: Array<[name: string, kind: string, emoji: string, color: string]>;
  colors: string[];
  income: string; // the catch-all income category
  today: string;
}
