// Kalyta backend: Apple Pay (Shortcuts) -> Google Sheets, Overview/Details tabs, web dashboard and JSON API for the app
// Deploy: Deploy -> New deployment -> Web app (Execute as: Me | Who has access: Anyone)
// After any code change: Deploy -> Manage deployments -> Edit -> Version: New version -> Deploy

const SECRET = 'REPLACE_WITH_A_LONG_RANDOM_STRING';      // shortcuts send this with every POST
const VIEW_KEY = 'REPLACE_WITH_ANOTHER_RANDOM_STRING';   // app + web dashboard key: <web app URL>?key=VIEW_KEY
const SHEET_NAME = 'Expenses';
const RULES_SHEET = 'Rules';           // A = Keyword, B = Category (place contains keyword -> category)
const BUDGETS_SHEET = 'Budgets';       // A = Category ("Total" for all spending), B = monthly limit in USD
const SUBS_SHEET = 'Subscriptions';
const SUBS_HEADERS = ['ID', 'Name', 'Amount', 'Currency', 'Cadence', 'Next', 'Account', 'Category', 'Paused', 'Previous amount'];
const ACCOUNTS_SHEET = 'Accounts';     // A Account | B Type | C Currency | D Balance | E Updated | F USD | G Checked | H Domain (logo)
const HISTORY_SHEET = 'Balance history';
// Kind: check = balance entered by hand, adjust = correction logged as "Balance adjustment", move = transfer
const HISTORY_HEADERS = ['Date', 'Account', 'Balance', 'Currency', 'Change', 'Kind', 'ID'];
const OVERVIEW_SHEET = 'Overview';
const DETAILS_SHEET = 'Details';
const OLD_DASHBOARD_SHEET = 'Dashboard';
const BASE_CURRENCY = 'USD';         // everything on the dashboard is in this currency
const LOCAL_CURRENCY = 'PLN';        // assumed when Apple Pay sends no currency symbol

const HEADERS = ['Date', 'Amount', 'Currency', 'Merchant', 'Card', 'Category', 'Note', 'Source', 'Raw', 'Amount USD', 'ID'];
const COL = { date: 1, amount: 2, currency: 3, merchant: 4, card: 5, category: 6, note: 7, source: 8, raw: 9, base: 10, id: 11 };

const CATEGORIES = ['Food', 'Transport', 'Home', 'Lifestyle', 'Subscriptions', 'Business', 'Other'];
const INCOME = 'Income';              // category for money coming in (salary, invoices, refunds)
const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CURRENCIES = [
  ['PLN', /zł|PLN/i],
  ['EUR', /€|EUR/i],
  ['USD', /\$|USD/i],
  ['GBP', /£|GBP/i],
  ['UAH', /₴|грн|UAH/i],
  ['AED', /AED|د\.إ/i],
];

// ---------- Web app ----------

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action) return json(handleApi(data));   // Kalyta app
    if (data.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (clean(data.type).toLowerCase() === 'balance') {
        updateBalance(clean(data.account), data.balance, data.currency);
        return json({ ok: true });
      }
      const merchant = clean(data.merchant);
      const parsed = parseAmount(data.amount);
      addTransaction({
        date: new Date(),
        amount: parsed.amount,
        currency: parsed.currency || clean(data.currency).toUpperCase(),
        merchant: merchant,
        card: clean(data.card),
        category: clean(data.category) || autoCategory(merchant),
        note: clean(data.note),
        source: clean(data.source) || 'apple_pay',
        raw: clean(data.amount),
      });
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function addTransaction(t) {
  getSheet().appendRow([
    t.date, t.amount, t.currency, t.merchant, t.card, t.category, t.note, t.source, t.raw,
    toBase(t.amount, t.currency, t.date), t.id || newId(),
  ]);
}

// <web app URL>?key=VIEW_KEY opens the dashboard; without the key it only says the deployment is alive
function doGet(e) {
  const key = e && e.parameter ? e.parameter.key : '';
  const keySet = VIEW_KEY && VIEW_KEY.indexOf('REPLACE_') !== 0;
  if (e && e.parameter && e.parameter.action) {
    try {
      return json(handleApi({ key: key, action: e.parameter.action }));
    } catch (err) {
      return json({ ok: false, error: String(err.message || err) });
    }
  }
  if (keySet && key === VIEW_KEY) {
    return HtmlService.createHtmlOutput(renderPage(getDashboardData()))
      .setTitle('Finances')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return json({ ok: true, status: 'alive', dashboard: keySet ? 'add ?key=...' : 'set VIEW_KEY in the script first' });
}

// ---------- JSON API for the Kalyta app ----------
// POST body (text/plain JSON): { key: VIEW_KEY, action, ... } -> { ok, data } or { ok: false, error }
//   data                                        -> everything the app shows
//   add      { tx: {id, kind, date, amount, currency, merchant, account, category, note} }
//   update   { id, tx: {...same fields} }
//   delete   { id }
//   transfer { tr: {id, date, from, sent, fromCurrency, to, received, toCurrency, note} }
//   updateTransfer { id, tr: {...same fields} }
//   deleteTransfer { id }
//   balance  { account, balance, mode?: 'adjust' | 'check', id? }   adjust = logged as a balance adjustment
//   deleteAdjustment { id }   undoes an adjustment: moves the balance back
//   repair   recreates missing tabs and headers
//   budgets  { total, cats: {category: limit} }   monthly limits in USD, replaces all
//   subscription { sub: {id, name, amount, currency, cadence, next, account, category, paused, prev} }   add or edit
//   deleteSubscription { id }
//   rule     { kw, cat, past?, replaces? }   one rule per keyword; past = also recategorize earlier expenses
//   deleteRule { kw }
//   accountDomain { account, domain }   website used for the account's logo

const TRANSFERS_SHEET = 'Transfers';
const TRANSFER_HEADERS = ['Date', 'From', 'Sent', 'Currency', 'To', 'Received', 'Currency', 'Sent USD', 'Received USD', 'Rate', 'Note', 'ID'];

function keyOk(key) {
  return VIEW_KEY && VIEW_KEY.indexOf('REPLACE_') !== 0 && key === VIEW_KEY;
}

function handleApi(body) {
  if (!keyOk(body.key)) return { ok: false, error: 'unauthorized' };
  const action = clean(body.action);
  if (action === 'data') return { ok: true, data: getApiData() };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id = '';
  try {
    if (action === 'add') id = apiAdd(body.tx || {});
    else if (action === 'update') id = apiUpdate(clean(body.id), body.tx || {});
    else if (action === 'delete') id = apiDelete(clean(body.id));
    else if (action === 'transfer') id = apiTransfer(body.tr || {});
    else if (action === 'updateTransfer') id = apiUpdateTransfer(clean(body.id), body.tr || {});
    else if (action === 'deleteTransfer') id = apiDeleteTransfer(clean(body.id));
    else if (action === 'deleteAdjustment') id = apiDeleteAdjustment(clean(body.id));
    else if (action === 'repair') repairTabs();
    else if (action === 'budgets') saveBudgets(body.total, body.cats || {});
    else if (action === 'subscription') id = saveSubscription(body.sub || {});
    else if (action === 'deleteSubscription') id = deleteById(getSubsSheet(), 1, clean(body.id));
    else if (action === 'rule') saveRule(clean(body.kw), clean(body.cat), !!body.past, clean(body.replaces));
    else if (action === 'deleteRule') deleteRule(clean(body.kw));
    else if (action === 'accountDomain') setAccountDomain(clean(body.account), clean(body.domain));
    else if (action === 'balance') {
      if (!clean(body.account)) throw new Error('Pick an account');
      id = clean(body.id) || newId();
      if (findRowById(getHistorySheet(), 7, id) < 0) {
        updateBalance(clean(body.account), String(body.balance), '', clean(body.mode) === 'adjust' ? 'adjust' : 'check', id);
      }
    } else throw new Error('Unknown action: ' + action);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: id, data: getApiData() };
}

function newId() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function spreadsheetTz() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

// "2026-10-07T15:30" or "2026-10-07" in the spreadsheet's time zone; empty -> now
function parseAppDate(s) {
  s = clean(s);
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T12:00';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new Error('Bad date: ' + s);
  return Utilities.parseDate(s, spreadsheetTz(), "yyyy-MM-dd'T'HH:mm");
}

function txFields(tx) {
  const parsed = parseAmount(String(tx.amount));
  if (parsed.amount === '' || !(parsed.amount > 0)) throw new Error('Enter an amount');
  const merchant = clean(tx.merchant);
  const kind = clean(tx.kind) === 'income' ? 'income' : 'expense';
  return {
    date: parseAppDate(tx.date),
    amount: parsed.amount,
    currency: (clean(tx.currency) || parsed.currency || LOCAL_CURRENCY).toUpperCase(),
    merchant: merchant,
    card: clean(tx.account),
    category: kind === 'income' ? INCOME : (clean(tx.category) || autoCategory(merchant) || 'Other'),
    note: clean(tx.note),
  };
}

function findRowById(sheet, idCol, id) {
  if (!id) return -1;
  const n = sheet.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sheet.getRange(2, idCol, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (clean(ids[i][0]) === id) return i + 2;
  return -1;
}

function apiAdd(tx) {
  const sheet = getSheet();
  const id = clean(tx.id) || newId();
  if (findRowById(sheet, COL.id, id) > 0) return id;   // already saved (offline retry)
  const f = txFields(tx);
  addTransaction(Object.assign(f, { source: 'app', raw: clean(tx.amount) + ' ' + f.currency, id: id }));
  return id;
}

function apiUpdate(id, tx) {
  const sheet = getSheet();
  const row = findRowById(sheet, COL.id, id);
  if (row < 0) throw new Error('Entry not found');
  const f = txFields(tx);
  sheet.getRange(row, COL.date, 1, 7).setValues([[f.date, f.amount, f.currency, f.merchant, f.card, f.category, f.note]]);
  sheet.getRange(row, COL.base).setValue(toBase(f.amount, f.currency, f.date));
  return id;
}

function apiDelete(id) {
  const sheet = getSheet();
  const row = findRowById(sheet, COL.id, id);
  if (row > 0) sheet.deleteRow(row);
  return id;
}

// ----- transfers between own accounts (not spending, not income) -----

function getTransfersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TRANSFERS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TRANSFERS_SHEET);
    sh.setFrozenRows(1);
  }
  if (sh.getMaxColumns() < TRANSFER_HEADERS.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), TRANSFER_HEADERS.length - sh.getMaxColumns());
  }
  const head = sh.getRange(1, 1, 1, TRANSFER_HEADERS.length).getValues()[0];
  if (head.join('|') !== TRANSFER_HEADERS.join('|')) {
    sh.getRange(1, 1, 1, TRANSFER_HEADERS.length).setValues([TRANSFER_HEADERS]).setFontWeight('bold');
  }
  return sh;
}

function usdFormula(amountCell, curCell, dateCell) {
  return '=IF(' + amountCell + '="", "", IF(OR(' + curCell + '="USD", ' + curCell + '="USDT", ' + curCell + '="USDC"), ' + amountCell +
    ', ' + amountCell + '*IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:"&' + curCell + '&"USD", "price", ' + dateCell + '), 2, 2), ' +
    'GOOGLEFINANCE("CURRENCY:"&' + curCell + '&"USD"))))';
}

function transferFields(tr) {
  const from = clean(tr.from), to = clean(tr.to);
  if (!from || !to) throw new Error('Pick both accounts');
  if (from.toLowerCase() === to.toLowerCase()) throw new Error('Pick two different accounts');
  const sent = parseAmount(String(tr.sent)).amount;
  const received = parseAmount(String(tr.received)).amount;
  if (!(sent > 0) || !(received > 0)) throw new Error('Enter both amounts');
  const fromCur = clean(tr.fromCurrency).toUpperCase() || accountCurrency(from) || LOCAL_CURRENCY;
  const toCur = clean(tr.toCurrency).toUpperCase() || accountCurrency(to) || fromCur;
  return { date: parseAppDate(tr.date), from: from, sent: sent, fromCur: fromCur, to: to, received: received, toCur: toCur, note: clean(tr.note) };
}

function writeTransfer(sh, row, f, id) {
  sh.getRange(row, 1, 1, 7).setValues([[f.date, f.from, f.sent, f.fromCur, f.to, f.received, f.toCur]]);
  sh.getRange(row, 8).setFormula(usdFormula('C' + row, 'D' + row, 'A' + row));
  sh.getRange(row, 9).setFormula(usdFormula('F' + row, 'G' + row, 'A' + row));
  sh.getRange(row, 10).setFormula('=IF(OR(C' + row + '="", F' + row + '=""), "", ROUND(C' + row + '/F' + row + ', 4))');
  sh.getRange(row, 11, 1, 2).setValues([[f.note, id]]);
  sh.getRange(row, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  adjustBalance(f.from, -f.sent, f.fromCur);
  adjustBalance(f.to, f.received, f.toCur);
}

// Moves both balances back as if the transfer in this row never happened
function reverseTransfer(sh, row) {
  const r = sh.getRange(row, 1, 1, 7).getValues()[0];
  adjustBalance(clean(r[1]), Number(r[2]) || 0, clean(r[3]));
  adjustBalance(clean(r[4]), -(Number(r[5]) || 0), clean(r[6]));
}

function apiTransfer(tr) {
  const sh = getTransfersSheet();
  const id = clean(tr.id) || newId();
  if (findRowById(sh, 12, id) > 0) return id;
  const f = transferFields(tr);
  writeTransfer(sh, Math.max(sh.getLastRow(), 1) + 1, f, id);
  return id;
}

function apiUpdateTransfer(id, tr) {
  const sh = getTransfersSheet();
  const row = findRowById(sh, 12, id);
  if (row < 0) throw new Error('Transfer not found');
  const f = transferFields(tr);
  reverseTransfer(sh, row);
  writeTransfer(sh, row, f, id);
  return id;
}

function apiDeleteTransfer(id) {
  const sh = getTransfersSheet();
  const row = findRowById(sh, 12, id);
  if (row < 0) return id;
  reverseTransfer(sh, row);
  sh.deleteRow(row);
  return id;
}

// Balance adjustments live in Balance history (Kind = adjust); deleting one moves the balance back
function apiDeleteAdjustment(id) {
  const sh = getHistorySheet();
  const row = findRowById(sh, 7, id);
  if (row < 0) return id;
  const r = sh.getRange(row, 1, 1, 7).getValues()[0];
  if (clean(r[5]) !== 'adjust') throw new Error('Not a balance adjustment');
  adjustBalance(clean(r[1]), -(Number(r[4]) || 0), clean(r[3]));
  sh.deleteRow(row);
  return id;
}

function repairTabs() {
  getSheet();
  getTransfersSheet();
  getAccountsSheet();
  getHistorySheet();
  getRulesSheet();
  getBudgetsSheet();
  getSubsSheet();
}

// ----- Kalyta 2.1: rules, budgets, subscriptions -----

// Case- and accent-insensitive text for matching places ("Żabka" matches "ZABKA")
function norm(s) {
  return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ensureTab(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setFrozenRows(1);
  }
  const head = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (head.join('|') !== headers.join('|')) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  return sh;
}

function getRulesSheet() {
  return ensureTab(RULES_SHEET, ['Keyword', 'Category']);
}

function getBudgetsSheet() {
  return ensureTab(BUDGETS_SHEET, ['Category', 'Monthly limit (USD)']);
}

function getSubsSheet() {
  return ensureTab(SUBS_SHEET, SUBS_HEADERS);
}

function rows(sh, cols) {
  const n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, cols).getValues();
}

function deleteById(sh, col, id) {
  const row = findRowById(sh, col, id);
  if (row > 0) sh.deleteRow(row);
  return id;
}

function saveBudgets(total, cats) {
  const sh = getBudgetsSheet();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  const out = [];
  const t = Number(total) || 0;
  if (t > 0) out.push(['Total', Math.round(t * 100) / 100]);
  CATEGORIES.forEach(c => {
    const v = Number(cats[c]) || 0;
    if (v > 0) out.push([c, Math.round(v * 100) / 100]);
  });
  if (out.length) sh.getRange(2, 1, out.length, 2).setValues(out);
}

function readBudgets() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BUDGETS_SHEET);
  const out = { total: 0, cats: {} };
  if (!sh) return out;
  rows(sh, 2).forEach(r => {
    const k = clean(r[0]), v = Number(r[1]) || 0;
    if (!k || !(v > 0)) return;
    if (k.toLowerCase() === 'total') out.total = v;
    else out.cats[k] = v;
  });
  return out;
}

function dayString(v) {
  return v instanceof Date ? Utilities.formatDate(v, spreadsheetTz(), 'yyyy-MM-dd') : clean(v);
}

function saveSubscription(x) {
  const sh = getSubsSheet();
  const id = clean(x.id) || newId();
  const name = clean(x.name);
  const amount = parseAmount(String(x.amount)).amount;
  if (!name) throw new Error('Enter a name');
  if (!(amount > 0)) throw new Error('Enter an amount');
  const cad = ['weekly', 'monthly', 'yearly'].indexOf(clean(x.cadence)) >= 0 ? clean(x.cadence) : 'monthly';
  const next = clean(x.next);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new Error('Bad date: ' + next);
  const prev = Number(x.prev) || '';
  const values = [[id, name, amount, clean(x.currency).toUpperCase() || LOCAL_CURRENCY, cad, next, clean(x.account),
    clean(x.category) || 'Subscriptions', x.paused ? 'yes' : '', prev]];
  let row = findRowById(sh, 1, id);
  if (row < 0) row = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 6).setNumberFormat('@');
  sh.getRange(row, 1, 1, SUBS_HEADERS.length).setValues(values);
  return id;
}

function readSubscriptions() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBS_SHEET);
  if (!sh) return [];
  return rows(sh, SUBS_HEADERS.length).filter(r => clean(r[0]) && clean(r[1])).map(r => ({
    id: clean(r[0]),
    name: clean(r[1]),
    amount: Number(r[2]) || 0,
    currency: clean(r[3]).toUpperCase(),
    cadence: clean(r[4]) || 'monthly',
    next: dayString(r[5]),
    account: clean(r[6]),
    category: clean(r[7]) || 'Subscriptions',
    paused: !!clean(r[8]),
    prev: Number(r[9]) || null,
  }));
}

// One rule per keyword: a new rule for the same keyword replaces the old one
function saveRule(kw, cat, past, replaces) {
  if (norm(kw).length < 2) throw new Error('Keyword is too short');
  if (CATEGORIES.indexOf(cat) < 0) throw new Error('Unknown category: ' + cat);
  const sh = getRulesSheet();
  const drop = [norm(kw), norm(replaces)].filter(Boolean);
  const kept = rows(sh, 2).filter(r => clean(r[0]) && drop.indexOf(norm(r[0])) < 0);
  kept.unshift([kw, cat]);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, kept.length, 2).setValues(kept);
  if (past) recategorize(kw, cat);
}

function deleteRule(kw) {
  const sh = getRulesSheet();
  const kept = rows(sh, 2).filter(r => clean(r[0]) && norm(r[0]) !== norm(kw));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  if (kept.length) sh.getRange(2, 1, kept.length, 2).setValues(kept);
}

// Moves earlier expenses whose place contains the keyword into the category
function recategorize(kw, cat) {
  const sheet = getSheet();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return;
  const range = sheet.getRange(2, COL.merchant, n, COL.category - COL.merchant + 1);
  const values = range.getValues();
  const k = norm(kw);
  let changed = false;
  values.forEach(r => {
    const cur = clean(r[COL.category - COL.merchant]);
    if (cur !== INCOME && norm(r[0]).indexOf(k) >= 0 && cur !== cat) {
      r[COL.category - COL.merchant] = cat;
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

function readRules() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RULES_SHEET);
  if (!sh) return [];
  return rows(sh, 2).filter(r => clean(r[0]) && clean(r[1])).map(r => [clean(r[0]), clean(r[1])]);
}

function setAccountDomain(name, domain) {
  const row = accountRow(name);
  if (row < 0) throw new Error('Account not found');
  domain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  getAccountsSheet().getRange(row, 8).setValue(domain);
}

function sameCurrency(a, b) {
  const norm = c => {
    c = clean(c).toUpperCase();
    return c === 'USDT' || c === 'USDC' ? 'USD' : c;
  };
  return norm(a) === norm(b);
}

function accountRow(name) {
  const sh = getAccountsSheet();
  const n = sh.getLastRow() - 1;
  if (n < 1 || !name) return -1;
  const names = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < names.length; i++) if (clean(names[i][0]).toLowerCase() === name.toLowerCase()) return i + 2;
  return -1;
}

function accountCurrency(name) {
  const row = accountRow(name);
  return row > 0 ? clean(getAccountsSheet().getRange(row, 3).getValue()).toUpperCase() : '';
}

// Moves an account balance by delta (only when the currency matches the account's)
function adjustBalance(name, delta, currency) {
  const row = accountRow(name);
  if (row < 0) return;
  const sh = getAccountsSheet();
  const cur = clean(sh.getRange(row, 3).getValue());
  if (currency && !sameCurrency(cur, currency)) return;
  const balance = Number(sh.getRange(row, 4).getValue()) || 0;
  const next = Math.round((balance + delta) * 100) / 100;
  const now = new Date();
  sh.getRange(row, 4, 1, 2).setValues([[next, now]]);
  getHistorySheet().appendRow([now, clean(sh.getRange(row, 1).getValue()), next, cur, Math.round(delta * 100) / 100, 'move', newId()]);
}

// ----- data for the app -----

function ensureIds(sheet, idCol, n) {
  if (n < 1) return;
  const range = sheet.getRange(2, idCol, n, 1);
  const ids = range.getValues();
  let changed = false;
  ids.forEach(r => {
    if (!clean(r[0])) {
      r[0] = newId();
      changed = true;
    }
  });
  if (changed) range.setValues(ids);
}

function getApiData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const fmt = d => (d instanceof Date ? Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm") : '');

  const exp = getSheet();
  const n = exp.getLastRow() - 1;
  ensureIds(exp, COL.id, n);
  const tx = n < 1 ? [] : exp.getRange(2, 1, n, HEADERS.length).getValues()
    .filter(r => r[COL.date - 1] instanceof Date)
    .map(r => [
      clean(r[COL.id - 1]),
      fmt(r[COL.date - 1]),
      Number(r[COL.amount - 1]) || 0,
      clean(r[COL.currency - 1]),
      clean(r[COL.merchant - 1]),
      clean(r[COL.card - 1]),
      clean(r[COL.category - 1]),
      clean(r[COL.note - 1]),
      clean(r[COL.source - 1]),
      r[COL.base - 1] === '' || isNaN(Number(r[COL.base - 1])) ? null : Math.round(Number(r[COL.base - 1]) * 100) / 100,
    ]);

  const trSheet = ss.getSheetByName(TRANSFERS_SHEET) ? getTransfersSheet() : null;
  let transfers = [];
  if (trSheet && trSheet.getLastRow() > 1) {
    const m = trSheet.getLastRow() - 1;
    ensureIds(trSheet, 12, m);
    transfers = trSheet.getRange(2, 1, m, 12).getValues()
      .filter(r => r[0] instanceof Date)
      .map(r => [clean(r[11]), fmt(r[0]), clean(r[1]), Number(r[2]) || 0, clean(r[3]), clean(r[4]), Number(r[5]) || 0, clean(r[6]), clean(r[10])]);
  }

  const acc = ss.getSheetByName(ACCOUNTS_SHEET);
  const day = d => (d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : clean(d));
  const accounts = !acc || acc.getLastRow() < 2 ? [] : acc.getRange(2, 1, acc.getLastRow() - 1, Math.min(8, Math.max(7, acc.getLastColumn()))).getValues()
    .filter(r => clean(r[0]))
    .map(r => ({
      name: clean(r[0]),
      type: clean(r[1]) || 'Account',
      currency: clean(r[2]).toUpperCase(),
      balance: Number(r[3]) || 0,
      updated: day(r[4]),
      checked: day(r[6]) || day(r[4]),
      domain: clean(r[7]),
      usd: typeof r[5] === 'number' ? Math.round(r[5] * 100) / 100 : null,
    }));

  // [id, date, account, change, currency]
  const hist = ss.getSheetByName(HISTORY_SHEET);
  const adjustments = !hist || hist.getLastRow() < 2 || hist.getLastColumn() < 7 ? [] :
    hist.getRange(2, 1, hist.getLastRow() - 1, 7).getValues()
      .filter(r => r[0] instanceof Date && clean(r[5]) === 'adjust' && clean(r[6]))
      .map(r => [clean(r[6]), fmt(r[0]), clean(r[1]), Number(r[4]) || 0, clean(r[3])]);

  return {
    tx: tx,
    transfers: transfers,
    accounts: accounts,
    adjustments: adjustments,
    rates: currentRates(),
    sheetName: ss.getName(),
    budgets: readBudgets(),
    subscriptions: readSubscriptions(),
    rules: readRules(),
    categories: CATEGORIES,
    colors: CATEGORY_COLORS,
    income: INCOME,
    base: BASE_CURRENCY,
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- Menu ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Expenses')
    .addItem('Rebuild dashboards', 'setupDashboard')
    .addItem('Fill missing USD amounts', 'fillMissingBase')
    .addToUi();
}

function fillMissingBase() {
  const n = backfillBase();
  SpreadsheetApp.getActiveSpreadsheet().toast(n + ' row(s) converted to ' + BASE_CURRENCY, 'Expenses');
}

// ---------- Parsing ----------

// "1 234,50 zł" / "€12.50" / "$1,234.50" / "1.234,50 €" -> { amount, currency }
function parseAmount(raw) {
  const s = clean(raw).replace(/[  ]/g, ' ');
  let num = s.replace(/[^\d.,-]/g, '');
  const lastComma = num.lastIndexOf(',');
  const lastDot = num.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    num = lastComma > lastDot
      ? num.replace(/\./g, '').replace(',', '.')
      : num.replace(/,/g, '');
  } else if (lastComma > -1) {
    num = /,\d{1,2}$/.test(num) ? num.replace(',', '.') : num.replace(/,/g, '');
  }

  const amount = parseFloat(num);
  return { amount: isNaN(amount) ? '' : Math.abs(amount), currency: detectCurrency(s) };
}

function detectCurrency(s) {
  for (const [code, re] of CURRENCIES) {
    if (re.test(s)) return code;
  }
  return '';
}

// "Rules" sheet: if the merchant contains the keyword -> use that category
function autoCategory(merchant) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RULES_SHEET);
  if (!sheet || !merchant) return '';
  const m = norm(merchant);
  const list = sheet.getDataRange().getValues().slice(1);
  for (const [keyword, category] of list) {
    if (keyword && m.includes(norm(keyword))) return category;
  }
  return '';
}

// ---------- Currency (NBP rates, converted via PLN) ----------

// Converts via PLN using NBP rates: amount * (PLN per X) / (PLN per USD).
// Blank currency is treated as LOCAL_CURRENCY.
function toBase(amount, currency, date) {
  if (amount === '' || amount == null || isNaN(Number(amount))) return '';
  const code = (currency || LOCAL_CURRENCY).toUpperCase();
  if (code === BASE_CURRENCY) return Number(amount);
  const plnPerUnit = code === 'PLN' ? 1 : nbpRate(code, date);
  const plnPerBase = BASE_CURRENCY === 'PLN' ? 1 : nbpRate(BASE_CURRENCY, date);
  if (!plnPerUnit || !plnPerBase) return '';
  return Math.round(Number(amount) * plnPerUnit / plnPerBase * 100) / 100;
}

// NBP mid rate from the last business day BEFORE the date (the rule Polish tax uses).
// Table A = daily rates, table B = weekly (e.g. AED).
function nbpRate(code, date) {
  const day = 24 * 3600 * 1000;
  const to = fmtDate(new Date(date.getTime() - day));
  const from = fmtDate(new Date(date.getTime() - 15 * day));
  const cache = CacheService.getScriptCache();
  const key = 'nbp_' + code + '_' + to;
  const hit = cache.get(key);
  if (hit) return Number(hit);

  for (const table of ['a', 'b']) {
    try {
      const url = 'https://api.nbp.pl/api/exchangerates/rates/' + table + '/' + code.toLowerCase() +
        '/' + from + '/' + to + '/?format=json';
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) continue;
      const rates = JSON.parse(res.getContentText()).rates || [];
      if (!rates.length) continue;
      const mid = rates[rates.length - 1].mid;
      cache.put(key, String(mid), 6 * 3600);
      return mid;
    } catch (err) {
      // network hiccup: leave blank, "Fill missing USD amounts" retries later
    }
  }
  return null;
}

function backfillBase() {
  const sheet = getSheet();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return 0;
  const rows = sheet.getRange(2, 1, n, HEADERS.length).getValues();
  let filled = 0;
  const out = rows.map(r => {
    const current = r[COL.base - 1];
    const amount = r[COL.amount - 1];
    if (current !== '' || amount === '') return [current];
    const date = r[COL.date - 1] instanceof Date ? r[COL.date - 1] : new Date();
    const v = toBase(amount, clean(r[COL.currency - 1]), date);
    if (v !== '') filled++;
    return [v];
  });
  sheet.getRange(2, COL.base, n, 1).setValues(out);
  return filled;
}

// ---------- Expenses sheet ----------

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  const first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (first[COL.base - 1] && first[COL.base - 1] !== HEADERS[COL.base - 1] && sheet.getLastRow() > 1) {
    // converted column was in another currency (e.g. "Amount PLN"): clear it, setupDashboard refills it
    sheet.getRange(2, COL.base, sheet.getLastRow() - 1, 1).clearContent();
  }
  if (first.join('|') !== HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------- Accounts ----------

// Balance update from the "Update balance" shortcut: { type: 'balance', account, balance, currency? }
function updateBalance(name, rawBalance, currency, kind, id) {
  if (!name) throw new Error('account is required');
  const parsed = parseAmount(rawBalance);
  if (parsed.amount === '') throw new Error('balance is not a number');

  const sh = getAccountsSheet();
  const last = sh.getLastRow();
  const names = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => clean(r[0]).toLowerCase()) : [];
  let row = names.indexOf(name.toLowerCase()) + 2;
  if (row < 2) {
    row = last + 1;
    const cur = (clean(currency) || parsed.currency || LOCAL_CURRENCY).toUpperCase();
    sh.getRange(row, 1, 1, 3).setValues([[name, 'Account', cur]]);
    sh.getRange(row, 6).setFormula(accountUsdFormula(row));
  }
  const now = new Date();
  const before = Number(sh.getRange(row, 4).getValue()) || 0;
  sh.getRange(row, 4, 1, 2).setValues([[parsed.amount, now]]);
  sh.getRange(row, 7).setValue(now);
  const change = Math.round((parsed.amount - before) * 100) / 100;
  getHistorySheet().appendRow([now, clean(sh.getRange(row, 1).getValue()), parsed.amount, clean(sh.getRange(row, 3).getValue()),
    change, change && kind === 'adjust' ? 'adjust' : 'check', id || newId()]);
}

// USD per unit for the currencies the app converts between, today
function currentRates() {
  const rates = { USD: 1, USDT: 1, USDC: 1 };
  const now = new Date();
  const plnPerUsd = nbpRate('USD', now);
  if (!plnPerUsd) return rates;
  rates.PLN = Math.round(1 / plnPerUsd * 1e6) / 1e6;
  ['EUR', 'UAH', 'GBP'].forEach(code => {
    const pln = nbpRate(code, now);
    if (pln) rates[code] = Math.round(pln / plnPerUsd * 1e6) / 1e6;
  });
  return rates;
}

// USD value of an account row; "You owe" counts as negative
function accountUsdFormula(row) {
  return '=IF(D' + row + '="", "", IF(B' + row + '="You owe", -1, 1)*IF(C' + row + '="' + BASE_CURRENCY + '", D' + row +
    ', D' + row + '*GOOGLEFINANCE("CURRENCY:"&C' + row + '&"' + BASE_CURRENCY + '")))';
}

function getAccountsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ACCOUNTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ACCOUNTS_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([['Account', 'Type', 'Currency', 'Balance', 'Updated', BASE_CURRENCY]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  if (clean(sh.getRange(1, 7).getValue()) !== 'Checked') {
    sh.getRange(1, 7).setValue('Checked').setFontWeight('bold');
    sh.getRange('G:G').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  if (sh.getMaxColumns() < 8) sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());
  if (clean(sh.getRange(1, 8).getValue()) !== 'Domain') sh.getRange(1, 8).setValue('Domain').setFontWeight('bold');
  return sh;
}

function getHistorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HISTORY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HISTORY_SHEET);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  if (sh.getMaxColumns() < HISTORY_HEADERS.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), HISTORY_HEADERS.length - sh.getMaxColumns());
  }
  const head = sh.getRange(1, 1, 1, HISTORY_HEADERS.length).getValues()[0];
  if (head.join('|') !== HISTORY_HEADERS.join('|')) {
    sh.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS]).setFontWeight('bold');
  }
  return sh;
}

// ---------- Dashboards (Overview + Details tabs) ----------

const THEME = { ink: '#1f1f1d', muted: '#6b6a65', line: '#d3d1c7', head: '#f1efe8', tile: '#f6f5f2', accent: '#2a78d6' };
const MONEY = '"$"#,##0;-"$"#,##0;"–"';
const NET = '"$"#,##0;[Red]-"$"#,##0;"–"';
const SPENT_COLOR = '#888780';
const INCOME_COLOR = '#1D9E75';

// Run once from the editor (or Expenses menu -> Rebuild dashboards).
// Doesn't touch the look of the Expenses sheet, so your own table formatting stays.
function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getSheet();
  getAccountsSheet();
  backfillBase();
  const old = ss.getSheetByName(OLD_DASHBOARD_SHEET);
  if (old) ss.deleteSheet(old);
  buildOverview(ss);
  buildDetails(ss);
  ss.setActiveSheet(ss.getSheetByName(OVERVIEW_SHEET));
  ss.toast('Overview and Details are ready', 'Expenses');
}

function buildOverview(ss) {
  const sh = freshSheet(ss, OVERVIEW_SHEET, 0, 14);
  const E = q(SHEET_NAME), AC = q(ACCOUNTS_SHEET);
  const A = E + '$A:$A', F = E + '$F:$F', J = E + '$J:$J';
  const NOT_INCOME = F + ', "<>' + INCOME + '"';
  const thisMonth = A + ', ">="&$L$2, ' + A + ', "<"&$L$3';

  // Layout: B..I content, J spacer, K..N hidden helpers
  [24, 130, 110, 110, 110, 110, 110, 110, 110, 24].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange('A:J').setFontColor(THEME.ink).setVerticalAlignment('middle');

  sh.getRange('B2').setValue('Finances').setFontSize(20).setFontWeight('bold');
  sh.getRange('B3').setFormula('="Overview · "&TEXT(TODAY(), "d mmmm yyyy")&"   ·   month drill-down on the Details tab"')
    .setFontColor(THEME.muted).setFontSize(10);

  // Helpers: L2 month start, L3 next month, L4 previous month, L5/L6 last month spent/income
  sh.getRange('L2').setFormula('=EOMONTH(TODAY(), -1)+1');
  sh.getRange('L3').setFormula('=EOMONTH(TODAY(), 0)+1');
  sh.getRange('L4').setFormula('=EOMONTH(TODAY(), -2)+1');
  sh.getRange('L5').setFormula('=SUMIFS(' + J + ', ' + A + ', ">="&$L$4, ' + A + ', "<"&$L$2, ' + NOT_INCOME + ')');
  sh.getRange('L6').setFormula('=SUMIFS(' + J + ', ' + A + ', ">="&$L$4, ' + A + ', "<"&$L$2, ' + F + ', "' + INCOME + '")');

  // Net worth
  sh.getRange('B5').setValue('Net worth').setFontColor(THEME.muted).setFontSize(10);
  sh.getRange('B6').setFormula('=SUM(' + AC + 'F2:F)');
  sh.getRange('B6:D6').merge().setFontSize(28).setFontWeight('bold').setNumberFormat(MONEY).setHorizontalAlignment('left');
  sh.getRange('B7').setFormula('=COUNTA(' + AC + 'A2:A)&" accounts · in USD · update balances on the Accounts tab or with the shortcut"')
    .setFontColor(THEME.muted).setFontSize(10);
  sh.setRowHeight(6, 46);

  // Accounts
  section(sh, 'B9', 'Accounts');
  header(sh, 10, ['Account', 'Type', 'Balance', 'Currency', 'USD', 'Share', '', 'Updated']);
  sh.getRange('C10').setHorizontalAlignment('left');
  sh.getRange('E10').setHorizontalAlignment('left');
  sh.getRange('B11').setFormula('=IFERROR(SORT(FILTER({' + AC + 'A2:A, ' + AC + 'B2:B, ' + AC + 'D2:D, ' + AC + 'C2:C, ' + AC + 'F2:F}, ' +
    AC + 'A2:A<>""), 5, FALSE), "Add accounts on the Accounts tab")');
  for (let r = 11; r <= 22; r++) {
    const ok = 'OR($B' + r + '="", NOT(ISNUMBER($F' + r + ')))';
    sh.getRange('G' + r).setFormula('=IF(' + ok + ', "", MAX(0, $F' + r + ')/SUMIF($F$11:$F$22, ">0"))');
    sh.getRange('H' + r).setFormula('=IF(' + ok + ', "", SPARKLINE(MAX(0, $F' + r + '), {"charttype","bar";"max",MAX($F$11:$F$22);"color1","' + INCOME_COLOR + '"}))');
    sh.getRange('I' + r).setFormula('=IF($B' + r + '="", "", IFERROR(INDEX(' + AC + '$E:$E, MATCH($B' + r + ', ' + AC + '$A:$A, 0)), ""))');
  }
  sh.getRange('C11:C22').setFontColor(THEME.muted);
  sh.getRange('D11:D22').setNumberFormat('#,##0.00');
  sh.getRange('E11:E22').setFontColor(THEME.muted);
  sh.getRange('F11:F22').setNumberFormat('"$"#,##0;-"$"#,##0').setFontWeight('bold');
  sh.getRange('G11:G22').setNumberFormat('0%').setFontColor(THEME.muted);
  sh.getRange('I11:I22').setNumberFormat('d mmm').setFontColor(THEME.muted).setHorizontalAlignment('right');

  // This month
  section(sh, 'B24', '="This month · "&TEXT(TODAY(), "mmmm")&"  (day "&DAY(TODAY())&" of "&DAY(EOMONTH(TODAY(), 0))&")"');
  kpiTiles(sh, 25, [
    ['B', 'Spent so far', '=SUMIFS(' + J + ', ' + thisMonth + ', ' + NOT_INCOME + ')', MONEY,
      '=COUNTIFS(' + thisMonth + ', ' + NOT_INCOME + ')&" transactions"'],
    ['D', 'Per day', '=$B$26/DAY(TODAY())', MONEY, '="last month: "&TEXT($L$5/DAY(EOMONTH(TODAY(), -1)), "$#,##0")'],
    ['F', 'On pace for', '=$D$26*DAY(EOMONTH(TODAY(), 0))', MONEY, '="last month: "&TEXT($L$5, "$#,##0")'],
    ['H', 'Income', '=SUMIFS(' + J + ', ' + thisMonth + ', ' + F + ', "' + INCOME + '")', MONEY,
      '="last month: "&TEXT($L$6, "$#,##0")'],
  ]);

  // Where it went (this month)
  section(sh, 'B29', '="Where it went · "&TEXT(TODAY(), "mmmm")');
  CATEGORIES.forEach((cat, i) => {
    const r = 30 + i;
    sh.getRange('B' + r).setValue(cat);
    sh.getRange('C' + r).setFormula('=IFERROR(SPARKLINE(MAX(0, $G' + r + '), {"charttype","bar";"max",MAX(1, MAX($G$30:$G$36));"color1","' +
      CATEGORY_COLORS[i] + '"}), "")');
    sh.getRange('C' + r + ':F' + r).merge();
    sh.getRange('G' + r).setFormula(cat === 'Other'
      ? '=ROUND($B$26-SUM($G$30:$G$35), 2)'
      : '=SUMIFS(' + J + ', ' + F + ', $B' + r + ', ' + thisMonth + ')');
    sh.getRange('H' + r).setFormula('=IFERROR(G' + r + '/SUM($G$30:$G$36), 0)');
  });
  sh.getRange('G30:G36').setNumberFormat(MONEY);
  sh.getRange('H30:H36').setNumberFormat('0%;-0%;"–"').setFontColor(THEME.muted);
  sh.getRange('B30:H36').setBorder(null, null, null, null, null, true, THEME.line, SpreadsheetApp.BorderStyle.SOLID);

  // Spent vs income, last 6 months (helper table L10:N16)
  section(sh, 'B38', 'Spent vs income · last 6 months');
  sh.getRange('L10:N10').setValues([['Month', 'Spent', 'Income']]);
  for (let i = 1; i <= 6; i++) {
    const r = 10 + i;
    const range = A + ', ">="&(EOMONTH(TODAY(), ' + (i - 7) + ')+1), ' + A + ', "<"&(EOMONTH(TODAY(), ' + (i - 6) + ')+1)';
    sh.getRange('L' + r).setFormula('=TEXT(EOMONTH(TODAY(), ' + (i - 7) + ')+1, "mmm")');
    sh.getRange('M' + r).setFormula('=SUMIFS(' + J + ', ' + range + ', ' + NOT_INCOME + ')');
    sh.getRange('N' + r).setFormula('=SUMIFS(' + J + ', ' + range + ', ' + F + ', "' + INCOME + '")');
  }
  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange('L10:N16'))
    .setNumHeaders(1)
    .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)
    .setColors([SPENT_COLOR, INCOME_COLOR])
    .setLegendPosition(Charts.Position.TOP)
    .setOption('vAxis.format', '$#,##0')
    .setOption('bar.groupWidth', '60%')
    .setOption('width', 900)
    .setOption('height', 280)
    .setPosition(39, 2, 0, 0)
    .build());

  sh.hideColumns(11, 4);
  protect(sh, []);
}

function buildDetails(ss) {
  const sh = freshSheet(ss, DETAILS_SHEET, 1, 14);
  const E = q(SHEET_NAME);
  const A = E + '$A:$A', F = E + '$F:$F', J = E + '$J:$J';
  const col2 = c => E + c + '2:' + c;   // 'Expenses'!A2:A
  const NOT_INCOME = F + ', "<>' + INCOME + '"';
  const catCols = ['C', 'D', 'E', 'F', 'G', 'H'];   // named categories; I = Other, J = Spent, K = Income, L = Net
  const tableCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const now = new Date();

  // Layout: B..L content, M spacer, N hidden helpers
  sh.setColumnWidth(1, 24);
  sh.setColumnWidth(2, 130);
  for (let c = 3; c <= 12; c++) sh.setColumnWidth(c, 92);
  sh.setColumnWidth(13, 24);
  sh.getRange('A:M').setFontColor(THEME.ink).setVerticalAlignment('middle');

  sh.getRange('B2').setValue('Details').setFontSize(20).setFontWeight('bold');
  sh.getRange('B3').setValue('All amounts in USD, converted at NBP rates of the previous business day. Income = category "' + INCOME + '".')
    .setFontColor(THEME.muted).setFontSize(10);

  // Selectors (the only editable cells)
  sh.getRange('B5').setValue('Year').setFontColor(THEME.muted).setHorizontalAlignment('right');
  sh.getRange('E5').setValue('Month').setFontColor(THEME.muted).setHorizontalAlignment('right');
  sh.getRange('C5').setValue(now.getFullYear()).setNumberFormat('0');
  sh.getRange('F5').setValue(MONTHS[now.getMonth()]);
  [sh.getRange('C5'), sh.getRange('F5')].forEach(r => r
    .setBackground('#eef4fc').setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID));
  sh.getRange('H5').setValue('← pick a year and month').setFontColor(THEME.muted).setFontSize(10);
  sh.getRange('F5').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MONTHS, true).build());
  sh.setRowHeight(5, 28);

  // Hidden helpers: N5 month start, N6 next month start, N7 previous month start
  sh.getRange('N5').setFormula('=DATE($C$5, MATCH($F$5, $B$13:$B$24, 0), 1)');
  sh.getRange('N6').setFormula('=EDATE($N$5, 1)');
  sh.getRange('N7').setFormula('=EDATE($N$5, -1)');
  sh.hideColumns(14);

  kpiTiles(sh, 7, [
    ['B', 'Spent', '=INDEX($J$13:$J$24, MATCH($F$5, $B$13:$B$24, 0))', MONEY,
      '=LET(prev, SUMIFS(' + J + ', ' + A + ', ">="&$N$7, ' + A + ', "<"&$N$5, ' + NOT_INCOME + '), ' +
      'IF(prev=0, "no data for previous month", TEXT($B$8/prev-1, "+0%;-0%;0%")&" vs previous month"))'],
    ['D', 'Income', '=INDEX($K$13:$K$24, MATCH($F$5, $B$13:$B$24, 0))', MONEY, '="in "&$F$5'],
    ['F', 'Net', '=$D$8-$B$8', NET, '=IF($D$8=0, "no income recorded", TEXT($F$8/$D$8, "0%;-0%")&" of income")'],
    ['H', 'Transactions', '=COUNTIFS(' + A + ', ">="&$N$5, ' + A + ', "<"&$N$6, ' + NOT_INCOME + ')', '0',
      '=IF($H$8=0, "", TEXT($B$8/$H$8, "$#,##0")&" average")'],
    ['J', 'Spent this year', '=$J$25', MONEY, '="net "&TEXT($L$25, "$#,##0;-$#,##0")&" in "&$C$5'],
  ]);

  // By month (selected year)
  section(sh, 'B11', '="By month · "&$C$5');
  header(sh, 12, ['Month'].concat(CATEGORIES, ['Spent', 'Income', 'Net']));
  MONTHS.forEach((name, i) => {
    const r = 13 + i, m = i + 1;
    const range = A + ', ">="&DATE($C$5, ' + m + ', 1), ' + A + ', "<"&DATE($C$5, ' + (m + 1) + ', 1)';
    sh.getRange('B' + r).setValue(name);
    catCols.forEach(c => sh.getRange(c + r).setFormula('=SUMIFS(' + J + ', ' + F + ', ' + c + '$12, ' + range + ')'));
    sh.getRange('I' + r).setFormula('=ROUND(J' + r + '-SUM(C' + r + ':H' + r + '), 2)');
    sh.getRange('J' + r).setFormula('=SUMIFS(' + J + ', ' + range + ', ' + NOT_INCOME + ')');
    sh.getRange('K' + r).setFormula('=SUMIFS(' + J + ', ' + range + ', ' + F + ', "' + INCOME + '")');
    sh.getRange('L' + r).setFormula('=K' + r + '-J' + r);
  });
  totalRow(sh, 25, 13, 24, tableCols);
  sh.getRange('C13:K25').setNumberFormat(MONEY);
  sh.getRange('L13:L25').setNumberFormat(NET);
  sh.getRange('J13:J25').setFontWeight('bold');

  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange('B12:I24'))
    .setNumHeaders(1)
    .setStacked()
    .setColors(CATEGORY_COLORS)
    .setLegendPosition(Charts.Position.TOP)
    .setTitle('Spending by month')
    .setOption('vAxis.format', '$#,##0')
    .setOption('bar.groupWidth', '55%')
    .setOption('width', 1050)
    .setOption('height', 320)
    .setPosition(27, 2, 0, 0)
    .build());

  // Breakdown of the selected month
  section(sh, 'B44', '="Spending breakdown · "&$F$5&" "&$C$5');
  header(sh, 45, ['Category', 'Amount', 'Share']);
  CATEGORIES.forEach((cat, i) => {
    const r = 46 + i;
    sh.getRange('B' + r).setValue(cat);
    sh.getRange('C' + r).setFormula('=INDEX($C$13:$I$24, MATCH($F$5, $B$13:$B$24, 0), ' + (i + 1) + ')');
    sh.getRange('D' + r).setFormula('=IFERROR(C' + r + '/$C$53, 0)');
  });
  sh.getRange('B53').setValue('Total');
  sh.getRange('C53').setFormula('=SUM(C46:C52)');
  sh.getRange('B53:D53').setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('C46:C53').setNumberFormat(MONEY);
  sh.getRange('D46:D52').setNumberFormat('0%;-0%;"–"');

  sh.insertChart(sh.newChart().asPieChart()
    .addRange(sh.getRange('B45:C52'))
    .setNumHeaders(1)
    .setOption('colors', CATEGORY_COLORS)
    .setLegendPosition(Charts.Position.RIGHT)
    .setOption('pieHole', 0.55)
    .setOption('pieSliceText', 'none')
    .setOption('width', 500)
    .setOption('height', 220)
    .setPosition(44, 6, 0, 0)
    .build());

  // Top merchants (spending only) + latest transactions (everything) for the selected month
  const inMonth = col2('A') + '>=$N$5, ' + col2('A') + '<$N$6';
  section(sh, 'B56', '="Top merchants · "&$F$5');
  sh.getRange('B57').setFormula(
    '=IFERROR(QUERY(FILTER({' + col2('D') + ', ' + col2('J') + '}, ' + inMonth + ', ' + col2('D') + '<>"", ' +
    col2('F') + '<>"' + INCOME + '"), ' +
    '"select Col1, sum(Col2), count(Col2) group by Col1 order by sum(Col2) desc limit 10 ' +
    'label Col1 \'Merchant\', sum(Col2) \'Amount\', count(Col2) \'Count\'", 0), "No spending this month")');
  styleHeaderRow(sh.getRange('B57:D57'));
  sh.getRange('C58:C67').setNumberFormat(MONEY);

  section(sh, 'F56', '="Latest transactions · "&$F$5');
  sh.getRange('F57:I57').setValues([['Date', 'Merchant', 'Category', 'Amount']]);
  styleHeaderRow(sh.getRange('F57:I57'));
  sh.getRange('F58').setFormula(
    '=IFERROR(SORTN(FILTER({' + col2('A') + ', ' + col2('D') + ', ' + col2('F') + ', ' + col2('J') + '}, ' + inMonth + '), ' +
    '10, 0, 1, FALSE), "No transactions this month")');
  sh.getRange('F58:F67').setNumberFormat('dd mmm, hh:mm');
  sh.getRange('I58:I67').setNumberFormat('"$"#,##0.00');

  // By account (card) for the selected month
  section(sh, 'B70', '="By account · "&$F$5');
  sh.getRange('B71').setFormula(
    '=IFERROR(QUERY(FILTER({' + col2('E') + ', ' + col2('J') + '}, ' + inMonth + ', ' + col2('F') + '<>"' + INCOME + '"), ' +
    '"select Col1, sum(Col2), count(Col2) group by Col1 order by sum(Col2) desc limit 8 ' +
    'label Col1 \'Account\', sum(Col2) \'Amount\', count(Col2) \'Count\'", 0), "No spending this month")');
  styleHeaderRow(sh.getRange('B71:D71'));
  sh.getRange('C72:C79').setNumberFormat(MONEY);

  // By year
  section(sh, 'B82', 'By year');
  header(sh, 83, ['Year'].concat(CATEGORIES, ['Spent', 'Income', 'Net']));
  sh.getRange('B84').setFormula('=IFERROR(SORT(UNIQUE(FILTER(YEAR(' + col2('A') + '), ISNUMBER(' + col2('A') + ')))), YEAR(TODAY()))');
  for (let r = 84; r <= 93; r++) {
    const range = A + ', ">="&DATE($B' + r + ', 1, 1), ' + A + ', "<"&DATE($B' + r + '+1, 1, 1)';
    const ifYear = f => '=IF($B' + r + '="", "", ' + f + ')';
    catCols.forEach(c => sh.getRange(c + r).setFormula(ifYear('SUMIFS(' + J + ', ' + F + ', ' + c + '$83, ' + range + ')')));
    sh.getRange('I' + r).setFormula(ifYear('ROUND(J' + r + '-SUM(C' + r + ':H' + r + '), 2)'));
    sh.getRange('J' + r).setFormula(ifYear('SUMIFS(' + J + ', ' + range + ', ' + NOT_INCOME + ')'));
    sh.getRange('K' + r).setFormula(ifYear('SUMIFS(' + J + ', ' + range + ', ' + F + ', "' + INCOME + '")'));
    sh.getRange('L' + r).setFormula(ifYear('K' + r + '-J' + r));
  }
  sh.getRange('B84:B93').setNumberFormat('0').setHorizontalAlignment('left');
  sh.getRange('C84:K93').setNumberFormat(MONEY);
  sh.getRange('L84:L93').setNumberFormat(NET);
  sh.getRange('J84:J93').setFontWeight('bold');
  sh.getRange('C5').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange('B84:B93'), true).build());

  protect(sh, [sh.getRange('C5'), sh.getRange('F5')]);
}

// ---------- Sheet helpers ----------

function q(name) {
  return "'" + name.replace(/'/g, "''") + "'!";
}

function freshSheet(ss, name, index, cols) {
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(name, index);
  sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
  return sh;
}

// Read-only: warn on any edit except the given cells
function protect(sh, editable) {
  const p = sh.protect().setDescription(sh.getName() + ' is read-only');
  p.setWarningOnly(true);
  if (editable.length) {
    try {
      p.setUnprotectedRanges(editable);
    } catch (err) {
      // the selectors will just show the warning too
    }
  }
}

// tiles: [column, label, value formula, number format, subtitle formula]; each tile spans two columns and three rows
function kpiTiles(sh, row, tiles) {
  tiles.forEach(([col, label, value, fmt, sub]) => {
    const next = String.fromCharCode(col.charCodeAt(0) + 1);
    sh.getRange(col + row).setValue(label);
    sh.getRange(col + (row + 1)).setFormula(value);
    sh.getRange(col + (row + 2)).setFormula(sub);
    sh.getRange(col + row + ':' + next + row).merge().setFontColor(THEME.muted).setFontSize(10);
    sh.getRange(col + (row + 1) + ':' + next + (row + 1)).merge().setFontSize(20).setFontWeight('bold')
      .setHorizontalAlignment('left').setNumberFormat(fmt);
    sh.getRange(col + (row + 2) + ':' + next + (row + 2)).merge().setFontColor(THEME.muted).setFontSize(10);
    sh.getRange(col + row + ':' + next + (row + 2)).setBackground(THEME.tile);
  });
  sh.setRowHeight(row + 1, 38);
}

function section(sh, a1, text) {
  const cell = sh.getRange(a1);
  if (String(text).charAt(0) === '=') cell.setFormula(text); else cell.setValue(text);
  cell.setFontSize(13).setFontWeight('bold');
}

function header(sh, row, labels) {
  const r = sh.getRange(row, 2, 1, labels.length).setValues([labels]);
  styleHeaderRow(r);
  sh.getRange(row, 3, 1, labels.length - 1).setHorizontalAlignment('right');
}

function styleHeaderRow(range) {
  range.setFontWeight('bold').setBackground(THEME.head)
    .setBorder(null, null, true, null, null, null, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
}

function totalRow(sh, row, from, to, cols) {
  sh.getRange('B' + row).setValue('Total');
  cols.forEach(c => sh.getRange(c + row).setFormula('=SUM(' + c + from + ':' + c + to + ')'));
  sh.getRange('B' + row + ':' + cols[cols.length - 1] + row).setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
}

// ---------- Web dashboard (open <web app URL>?key=VIEW_KEY) ----------

function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const exp = getSheet();
  const n = exp.getLastRow() - 1;
  const tx = n < 1 ? [] : exp.getRange(2, 1, n, HEADERS.length).getValues()
    .filter(r => r[COL.date - 1] instanceof Date && r[COL.base - 1] !== '' && !isNaN(Number(r[COL.base - 1])))
    .map(r => [
      Utilities.formatDate(r[COL.date - 1], tz, "yyyy-MM-dd'T'HH:mm"),
      clean(r[COL.merchant - 1]),
      clean(r[COL.card - 1]),
      clean(r[COL.category - 1]),
      Math.round(Number(r[COL.base - 1]) * 100) / 100,
      clean(r[COL.note - 1]),
    ]);

  const acc = ss.getSheetByName(ACCOUNTS_SHEET);
  const accounts = !acc || acc.getLastRow() < 2 ? [] : acc.getRange(2, 1, acc.getLastRow() - 1, 6).getValues()
    .filter(r => clean(r[0]))
    .map(r => ({
      name: clean(r[0]),
      type: clean(r[1]) || 'Account',
      currency: clean(r[2]).toUpperCase(),
      balance: Number(r[3]) || 0,
      updated: r[4] instanceof Date ? Utilities.formatDate(r[4], tz, 'yyyy-MM-dd') : clean(r[4]),
      usd: typeof r[5] === 'number' ? Math.round(r[5] * 100) / 100 : null,
    }));

  const now = new Date();
  return {
    tx: tx,
    accounts: accounts,
    categories: CATEGORIES,
    colors: CATEGORY_COLORS,
    income: INCOME,
    today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    generated: Utilities.formatDate(now, tz, 'd MMM, HH:mm'),
  };
}

function renderPage(data) {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return PAGE_HTML.replace('__DATA__', () => payload);
}

const PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Finances</title>
<style>
:root{--bg:#fafaf8;--card:#fff;--tile:#f2f1ed;--ink:#1f1f1d;--muted:#6b6a65;--faint:#8f8d85;--line:#e4e2da;--accent:#185FA5;--accent-bg:#E6F1FB;--good:#0F6E56;--bad:#A32D2D;--warn:#854F0B}
@media (prefers-color-scheme:dark){:root{--bg:#191918;--card:#232321;--tile:#2a2a28;--ink:#f3f2ee;--muted:#b4b2a9;--faint:#8f8d85;--line:#3a3a37;--accent:#85B7EB;--accent-bg:#0C447C;--good:#5DCAA5;--bad:#F09595;--warn:#EF9F27}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:780px;margin:0 auto;padding:20px 16px 56px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
h1{font-size:24px;font-weight:600;margin:0}
h3{font-size:15px;font-weight:600;margin:30px 0 10px}
p{margin:0}
.muted{color:var(--muted);font-weight:400}
.tabs{display:inline-flex;background:var(--tile);border-radius:10px;padding:3px;gap:2px}
.tabs button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:14px;padding:6px 16px;border-radius:8px;cursor:pointer}
.tabs button.on{background:var(--card);color:var(--ink);box-shadow:0 0 0 .5px var(--line)}
.grid{display:grid;gap:10px}
.kpi{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.acc{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px}
.two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));column-gap:28px}
.tile{background:var(--tile);border-radius:12px;padding:12px 14px}
.card{background:var(--card);border:.5px solid var(--line);border-radius:12px;padding:12px 14px}
.tl{font-size:12px;color:var(--muted)}
.tv{font-size:22px;font-weight:600;margin-top:2px}
.av{font-size:18px;font-weight:600;margin-top:2px}
.ts{font-size:12px;color:var(--faint);margin-top:2px}
.hero{font-size:42px;font-weight:600;letter-spacing:-.5px;line-height:1.15}
.stack{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px;margin-top:12px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:1px}
.br{display:grid;grid-template-columns:120px minmax(0,1fr) 72px 40px;gap:10px;align-items:center;font-size:14px;padding:7px 0;border-bottom:.5px solid var(--line)}
.br>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.track{height:10px;background:var(--tile);border-radius:4px;overflow:hidden}
.track div{height:100%;border-radius:4px}
.r{text-align:right}
.bs{text-align:right;color:var(--muted);font-size:12px}
.li{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:8px 0;border-bottom:.5px solid var(--line)}
.li span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-bottom:8px}
.cols{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.col{height:150px;border-bottom:.5px solid var(--line)}
.bars{display:flex;gap:4px;align-items:flex-end;justify-content:center;height:100%}
.b{width:22px;border-radius:4px 4px 0 0}
.lbl{font-size:12px;text-align:center;margin-top:6px}
.yt{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;font-size:14px;padding:7px 0;border-bottom:.5px solid var(--line)}
.yt.h{font-size:12px;color:var(--muted)}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.sel{display:flex;gap:8px;margin:16px 0 14px}
select{font:inherit;font-size:14px;padding:6px 10px;border-radius:8px;border:.5px solid var(--line);background:var(--card);color:var(--ink)}
@media (max-width:480px){.br{grid-template-columns:108px minmax(0,1fr) 60px 32px;gap:8px;font-size:13px}.hero{font-size:36px}.b{width:14px}}
</style></head>
<body><div class="wrap">
<div class="top">
  <div><h1>Finances</h1><p class="ts" id="gen"></p></div>
  <div class="tabs"><button id="t-ov" class="on">Overview</button><button id="t-de">Details</button></div>
</div>
<section id="overview"></section>
<section id="details" hidden>
  <div class="sel"><select id="m"></select><select id="y"></select></div>
  <div id="dbody"></div>
</section>
</div>
<script>
var D = __DATA__;
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var ACC_COLORS = ['#1D9E75','#BA7517','#7F77DD','#D4537E','#378ADD','#D85A30','#639922','#888780'];
var SYM = {USD:['$',''],EUR:['\\u20ac',''],GBP:['\\u00a3',''],PLN:['',' z\\u0142'],UAH:['',' \\u20b4']};

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function money(v,dec){ if(v==null||isNaN(v)) return '\\u2013'; dec=dec||0; return (v<0?'\\u2212':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
function native(v,cur){ var s=SYM[cur]||['',' '+cur]; var dec=cur==='UAH'?0:2; return s[0]+Number(v).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec})+s[1]; }
function sum(a){ return a.reduce(function(s,t){return s+t.usd;},0); }
function isInc(t){ return t.cat===D.income; }
function notInc(t){ return t.cat!==D.income; }
var TX = D.tx.map(function(t){ return {d:t[0], ym:t[0].slice(0,7), merchant:t[1], card:t[2], cat:t[3], usd:t[4], note:t[5]}; });
function inMonth(ym){ return TX.filter(function(t){return t.ym===ym;}); }
function shiftYm(ym,k){ var y=+ym.slice(0,4), m=+ym.slice(5,7)-1+k; y+=Math.floor(m/12); m=((m%12)+12)%12; return y+'-'+(m<9?'0':'')+(m+1); }
function daysIn(ym){ return new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate(); }
function mName(ym){ return MONTHS[+ym.slice(5,7)-1]; }
function catOf(t){ return D.categories.indexOf(t.cat)>=0 ? t.cat : 'Other'; }
function catTotals(rows){ var o={}; D.categories.forEach(function(c){o[c]=0;}); rows.forEach(function(t){o[catOf(t)]+=t.usd;}); return D.categories.map(function(c,i){return {name:c, v:o[c], color:D.colors[i]};}); }
function groupBy(rows,fn){ var o={}; rows.forEach(function(t){ var k=fn(t)||'\\u2014'; o[k]=o[k]||{v:0,n:0}; o[k].v+=t.usd; o[k].n++; }); return Object.keys(o).map(function(k){return {name:k,v:o[k].v,n:o[k].n};}).sort(function(a,b){return b.v-a.v;}); }
function fmtDay(d){ return (+d.slice(8,10))+' '+SHORT[+d.slice(5,7)-1]; }
function daysAgo(s){ if(!s) return 999; return Math.round((new Date(D.today)-new Date(s.slice(0,10)))/864e5); }
function age(s){ var n=daysAgo(s); return n<=0?'today':n===1?'yesterday':n>=999?'never updated':n+' days ago'; }
function tile(label,value,sub,cls){ return '<div class="tile"><p class="tl">'+label+'</p><p class="tv'+(cls?' '+cls:'')+'">'+value+'</p><p class="ts">'+(sub||'&nbsp;')+'</p></div>'; }
function barRow(name,color,v,max,share){ var w=max>0?Math.max(v>0?1:0,v/max*100):0; return '<div class="br"><span><i class="dot" style="background:'+color+'"></i>'+esc(name)+'</span><div class="track"><div style="width:'+w.toFixed(1)+'%;background:'+color+'"></div></div><span class="r">'+money(v)+'</span><span class="bs">'+Math.round(share*100)+'%</span></div>'; }
function listRow(left,right){ return '<div class="li"><span>'+left+'</span><span>'+right+'</span></div>'; }
function signed(v){ return (v>=0?'+':'\\u2212')+money(Math.abs(v)); }

function renderOverview(){
  var ym=D.today.slice(0,7), day=+D.today.slice(8,10), dim=daysIn(ym), prev=shiftYm(ym,-1);
  var accs=D.accounts.slice().sort(function(a,b){return (b.usd||0)-(a.usd||0);});
  var net=accs.reduce(function(s,a){return s+(typeof a.usd==='number'?a.usd:0);},0);
  var pos=accs.reduce(function(s,a){return s+(a.usd>0?a.usd:0);},0);
  var h='<div style="margin-top:22px"><p class="tl">Net worth</p><p class="hero">'+money(net)+'</p><p class="ts">'+accs.length+' accounts \\u00b7 in USD</p>';
  h+='<div class="stack">'+accs.map(function(a,i){ return a.usd>0?'<div title="'+esc(a.name)+'" style="width:'+(a.usd/pos*100).toFixed(2)+'%;background:'+ACC_COLORS[i%8]+'"></div>':''; }).join('')+'</div></div>';
  h+='<div class="grid acc">'+accs.map(function(a,i){
    var parts=[];
    if(a.currency!=='USD' && typeof a.usd==='number') parts.push('\\u2248 '+money(a.usd));
    if(a.type!=='Account') parts.push(a.type.toLowerCase());
    parts.push(age(a.updated));
    return '<div class="card"><p class="tl"><i class="dot" style="background:'+ACC_COLORS[i%8]+'"></i>'+esc(a.name)+'</p><p class="av">'+native(a.balance,a.currency)+'</p><p class="ts'+(daysAgo(a.updated)>7?' warn':'')+'">'+parts.join(' \\u00b7 ')+'</p></div>';
  }).join('')+'</div>';

  var cur=inMonth(ym), sp=cur.filter(notInc), spent=sum(sp), inc=sum(cur.filter(isInc));
  var pr=inMonth(prev), pSpent=sum(pr.filter(notInc)), pInc=sum(pr.filter(isInc));
  h+='<h3>This month \\u00b7 '+mName(ym)+' <span class="muted">day '+day+' of '+dim+'</span></h3>';
  h+='<div class="grid kpi">'+tile('Spent so far',money(spent),sp.length+' transactions')+tile('Per day',money(spent/day),'last month: '+money(pSpent/daysIn(prev)))+tile('On pace for','~'+money(spent/day*dim),'last month: '+money(pSpent))+tile('Income',inc?money(inc):'\\u2013','last month: '+money(pInc))+'</div>';

  var cats=catTotals(sp).filter(function(c){return c.v>0;}).sort(function(a,b){return b.v-a.v;}), max=cats.length?cats[0].v:0;
  h+='<h3>Where it went</h3>'+(cats.length?cats.map(function(c){return barRow(c.name,c.color,c.v,max,spent?c.v/spent:0);}).join(''):'<p class="ts">No spending yet this month.</p>');

  var months=[]; for(var k=-5;k<=0;k++) months.push(shiftYm(ym,k));
  var data=months.map(function(m){ var r=inMonth(m); return {m:m, s:sum(r.filter(notInc)), i:sum(r.filter(isInc))}; });
  var top=Math.max.apply(null,data.map(function(x){return Math.max(x.s,x.i);}).concat([1]));
  h+='<h3>Spent vs income \\u00b7 last 6 months</h3><div class="legend"><span><i class="dot" style="background:#888780"></i>Spent</span><span><i class="dot" style="background:#1D9E75"></i>Income</span></div>';
  h+='<div class="cols">'+data.map(function(x){ return '<div class="col"><div class="bars"><div class="b" title="Spent '+money(x.s)+'" style="height:'+(x.s/top*100).toFixed(1)+'%;background:#888780"></div><div class="b" title="Income '+money(x.i)+'" style="height:'+(x.i/top*100).toFixed(1)+'%;background:#1D9E75"></div></div></div>'; }).join('')+'</div>';
  h+='<div class="cols lbl">'+data.map(function(x){ var n=x.i-x.s; var txt=x.m===ym?'so far':(x.s||x.i?signed(n):'\\u2013'); var cls=x.m===ym||!(x.s||x.i)?'muted':(n>=0?'good':'bad'); return '<div>'+SHORT[+x.m.slice(5,7)-1]+'<br><span class="'+cls+'">'+txt+'</span></div>'; }).join('')+'</div>';
  document.getElementById('overview').innerHTML=h;
}

var SEL=D.today.slice(0,7);
function renderDetails(){
  var ym=SEL, prev=shiftYm(ym,-1);
  var cur=inMonth(ym), sp=cur.filter(notInc), spent=sum(sp), incRows=cur.filter(isInc), inc=sum(incRows), net=inc-spent;
  var pSpent=sum(inMonth(prev).filter(notInc));
  var vs=pSpent?((spent>=pSpent?'+':'\\u2212')+Math.abs(Math.round((spent/pSpent-1)*100))+'% vs '+mName(prev)):'no data for '+mName(prev);
  var srcs=groupBy(incRows,function(t){return t.note||t.merchant;}).slice(0,3).map(function(x){return esc(x.name);}).join(', ');
  var h='<div class="grid kpi">'+tile('Spent',money(spent),vs)+tile('Income',inc?money(inc):'\\u2013',srcs||'none recorded')+tile('Net',(inc||spent)?signed(net):'\\u2013',inc?Math.round(net/inc*100)+'% of income':'',net<0?'bad':(net>0?'good':''))+tile('Transactions',String(sp.length),sp.length?money(spent/sp.length)+' average':'')+'</div>';

  var cats=catTotals(sp).sort(function(a,b){return b.v-a.v;}), max=cats[0]?cats[0].v:0;
  h+='<h3>By category</h3>'+cats.map(function(c){return barRow(c.name,c.color,c.v,max,spent?c.v/spent:0);}).join('');

  var mer=groupBy(sp,function(t){return t.merchant||t.note;}).slice(0,8), acc=groupBy(sp,function(t){return t.card;});
  h+='<div class="grid two"><div><h3>Top merchants</h3>'+(mer.length?mer.map(function(m){return listRow(esc(m.name)+' <span class="muted">\\u00b7 '+m.n+'</span>',money(m.v));}).join(''):'<p class="ts">Nothing yet.</p>')+'</div>';
  h+='<div><h3>By account</h3>'+(acc.length?acc.map(function(m){return listRow(esc(m.name)+' <span class="muted">\\u00b7 '+m.n+'</span>',money(m.v));}).join(''):'<p class="ts">Nothing yet.</p>')+'</div></div>';

  var latest=cur.slice().sort(function(a,b){return a.d<b.d?1:-1;}).slice(0,12);
  h+='<h3>Latest transactions</h3>'+(latest.length?latest.map(function(t){ return listRow(fmtDay(t.d)+' \\u00b7 '+esc(t.merchant||t.note||'\\u2014')+' <span class="muted">\\u00b7 '+esc(t.cat||'Other')+'</span>', isInc(t)?'<span class="good">+'+money(t.usd,2)+'</span>':money(t.usd,2)); }).join(''):'<p class="ts">No transactions this month.</p>');

  var y=ym.slice(0,4), rows='';
  for(var m=1;m<=12;m++){ var k=y+'-'+(m<10?'0':'')+m, r=inMonth(k); if(!r.length) continue; var s=sum(r.filter(notInc)), i=sum(r.filter(isInc)); rows+='<div class="yt"><span>'+MONTHS[m-1]+'</span><span class="r">'+money(s)+'</span><span class="r">'+(i?money(i):'\\u2013')+'</span><span class="r '+(i-s>=0?'good':'bad')+'">'+signed(i-s)+'</span></div>'; }
  h+='<h3>By month \\u00b7 '+y+'</h3><div class="yt h"><span>Month</span><span class="r">Spent</span><span class="r">Income</span><span class="r">Net</span></div>'+(rows||'<p class="ts">No data for this year.</p>');
  document.getElementById('dbody').innerHTML=h;
}

function initSelectors(){
  var ms=document.getElementById('m'), ys=document.getElementById('y');
  ms.innerHTML=MONTHS.map(function(n,i){return '<option value="'+(i<9?'0':'')+(i+1)+'">'+n+'</option>';}).join('');
  var years={}; years[D.today.slice(0,4)]=1; TX.forEach(function(t){years[t.d.slice(0,4)]=1;});
  ys.innerHTML=Object.keys(years).sort().reverse().map(function(y){return '<option>'+y+'</option>';}).join('');
  ms.value=SEL.slice(5,7); ys.value=SEL.slice(0,4);
  function upd(){ SEL=ys.value+'-'+ms.value; renderDetails(); }
  ms.onchange=upd; ys.onchange=upd;
}

function tab(which){
  document.getElementById('overview').hidden=which!=='ov';
  document.getElementById('details').hidden=which!=='de';
  document.getElementById('t-ov').className=which==='ov'?'on':'';
  document.getElementById('t-de').className=which==='de'?'on':'';
}
document.getElementById('t-ov').onclick=function(){tab('ov');};
document.getElementById('t-de').onclick=function(){tab('de');};
document.getElementById('gen').textContent='Updated '+D.generated;
renderOverview(); initSelectors(); renderDetails();
</script>
</body></html>`;

// ---------- Utils ----------

function fmtDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function clean(v) {
  return v == null ? '' : String(v).trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run manually in the editor to grant permissions and check that writing works
function testDoPost() {
  const res = doPost({
    postData: {
      contents: JSON.stringify({ secret: SECRET, amount: '12,50 zł', merchant: 'Żabka', card: 'Wise' }),
    },
  });
  Logger.log(res.getContent());
}
