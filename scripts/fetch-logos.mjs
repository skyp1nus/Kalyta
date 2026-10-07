// Downloads bank and exchange logos as their App Store icons (the same pictures as on the
// iPhone home screen) into public/logos/<domain>.jpg. Run it when adding a bank to BANKS in
// src/lib/meta.ts; the results are committed, so builds never depend on Apple.
//   node scripts/fetch-logos.mjs [domain ...]
import { mkdir, writeFile } from 'node:fs/promises';

const SIZE = 256;
// domain, App Store search term, store country, what the app or developer name must contain
const APPS = [
  ['pkobp.pl', 'IKO PKO', 'pl', /IKO|PKO/i],
  ['mbank.pl', 'mBank PL', 'pl', /mBank/i],
  ['santander.pl', 'Erste', 'pl', /^Erste$/i], // Santander Bank Polska is now Erste Bank Polska
  ['ing.pl', 'Moje ING', 'pl', /\bING\b/i],
  ['pekao.com.pl', 'PeoPay', 'pl', /PeoPay|Pekao/i],
  ['bankmillennium.pl', 'Bank Millennium', 'pl', /Millennium/i],
  ['aliorbank.pl', 'Alior Mobile', 'pl', /Alior/i],
  ['credit-agricole.pl', 'CA24 Mobile', 'pl', /CA24|Agricole/i],
  ['bnpparibas.pl', 'GOmobile BNP Paribas', 'pl', /BNP|GOmobile/i],
  ['velobank.pl', 'VeloBank', 'pl', /Velo/i],
  ['monobank.ua', 'monobank', 'ua', /monobank|Universal Bank/i],
  ['privatbank.ua', 'Privat24', 'ua', /Privat|Приват/i],
  ['oschadbank.ua', 'Ощад 24/7', 'ua', /Ощад|Oschad/i],
  ['pumb.ua', 'ПУМБ', 'ua', /ПУМБ|PUMB|First Ukrainian/i],
  ['a-bank.com.ua', 'abank24', 'ua', /àbank|abank24|Accent/i],
  ['sensebank.ua', 'Sense SuperApp', 'ua', /Sense/i],
  ['raiffeisen.ua', 'MyRaif', 'ua', /MyRaif/i],
  ['izibank.com.ua', 'izibank', 'ua', /izi/i],
  ['wise.com', 'Wise money transfer', 'pl', /Wise/i],
  ['revolut.com', 'Revolut', 'pl', /Revolut/i],
  ['paypal.com', 'PayPal', 'pl', /PayPal/i],
  ['n26.com', 'N26', 'pl', /N26/i],
  ['payoneer.com', 'Payoneer', 'pl', /Payoneer/i],
  ['zen.com', 'ZEN.COM', 'pl', /\bZEN\b/i],
  ['binance.com', 'Binance', 'pl', /Binance/i],
  ['bybit.com', 'Bybit', 'pl', /Bybit/i],
  ['okx.com', 'OKX', 'pl', /OKX/i],
  ['whitebit.com', 'WhiteBIT', 'pl', /WhiteBIT/i],
  ['coinbase.com', 'Coinbase', 'pl', /Coinbase/i],
  ['kraken.com', 'Kraken', 'pl', /Kraken|Payward/i],
  ['kucoin.com', 'KuCoin', 'pl', /KuCoin/i],
  ['bitget.com', 'Bitget', 'pl', /Bitget/i],
  ['mexc.com', 'MEXC', 'pl', /MEXC/i],
  ['trustwallet.com', 'Trust Wallet', 'pl', /Trust/i],
  ['metamask.io', 'MetaMask', 'pl', /MetaMask|Consensys/i],
];

const only = process.argv.slice(2);
await mkdir('public/logos', { recursive: true });
const report = [];
for (const [domain, term, country, expect] of APPS) {
  if (only.length && !only.includes(domain)) continue;
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=8`;
    const res = await fetch(url);
    const { results = [] } = await res.json();
    const app = results.find((r) => expect.test(r.trackName) || expect.test(r.sellerName));
    if (!app) {
      report.push(`MISS ${domain}: ${results.map((r) => `${r.trackName} (${r.sellerName})`).join('; ')}`);
      continue;
    }
    const art = app.artworkUrl512.replace(/\/[^/]+$/, `/${SIZE}x${SIZE}bb.jpg`);
    const img = await fetch(art);
    if (!img.ok) throw new Error(`artwork ${img.status}`);
    await writeFile(`public/logos/${domain}.jpg`, Buffer.from(await img.arrayBuffer()));
    report.push(`OK   ${domain}: ${app.trackName} (${app.sellerName}) id${app.trackId}`);
  } catch (err) {
    report.push(`FAIL ${domain}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 3100)); // the search API allows about 20 calls a minute
}
console.log(report.join('\n'));
