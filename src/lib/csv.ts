import { isIncomeCat } from './meta';
import type { View } from './types';

const HEAD = [
  'Date',
  'Type',
  'Amount',
  'Currency',
  'Category',
  'Place',
  'Account',
  'To account',
  'Received',
  'Received currency',
  'Note',
  'USD',
];

function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Every record (or one month's, for "yyyy-MM") as CSV text
export function toCsv(view: View, ym = ''): string {
  const rows: Array<Array<string | number | null>> = [];
  for (const t of view.tx) {
    if (!t.date.startsWith(ym)) continue;
    const income = isIncomeCat(t.category);
    rows.push([
      t.date.replace('T', ' '),
      income ? 'income' : 'expense',
      t.amount,
      t.currency,
      income ? '' : t.category,
      t.merchant,
      t.account,
      '',
      '',
      '',
      t.note,
      t.usd,
    ]);
  }
  for (const t of view.transfers) {
    if (!t.date.startsWith(ym)) continue;
    rows.push([
      t.date.replace('T', ' '),
      'transfer',
      t.sent,
      t.fromCurrency,
      '',
      '',
      t.from,
      t.to,
      t.received,
      t.toCurrency,
      t.note,
      null,
    ]);
  }
  for (const a of view.adjustments) {
    if (!a.date.startsWith(ym)) continue;
    rows.push([
      a.date.replace('T', ' '),
      'adjustment',
      a.change,
      a.currency,
      '',
      '',
      a.account,
      '',
      '',
      '',
      '',
      null,
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [HEAD, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

// Opens the share sheet on iPhone (Save to Files), downloads elsewhere
export async function saveCsv(view: View, ym = ''): Promise<string> {
  const name = `kalyta-${ym || view.today}.csv`;
  const file = new File([`﻿${toCsv(view, ym)}`], name, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return name;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return '';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
