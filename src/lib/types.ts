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
  usd: number | null;
}

export interface ServerData {
  tx: TxRow[];
  transfers: TransferRow[];
  accounts: Account[];
  categories: string[];
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
  | { action: 'deleteTransfer'; id: string }
  | { action: 'balance'; account: string; balance: string };

export type Op = OpBody & {
  opId: string;
  createdAt: number;
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
  categories: string[];
  colors: string[];
  income: string;
  today: string;
}
