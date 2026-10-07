# Kalyta

A personal finance app that lives on your phone and keeps its data in your own Google Sheet.
Log spending, income, transfers between your accounts and account balances; see where the money went
by month and category, and how much you have across all accounts.

- **Installable PWA**: add it to the home screen and it runs full screen like a native app.
- **Works offline**: entries you add without a connection wait on the device and sync later.
- **No server**: a Google Apps Script bound to your sheet is the backend; the app is static files on GitHub Pages.
- **Multi-currency**: everything is converted to USD at NBP rates (via PLN) by the script; the app can show totals
  in USD, PLN, EUR or UAH and has a quick converter that works offline with the last saved rates.
- **iOS-style interface**: screens slide in and out (swipe from the left edge to go back), forms open as sheets you can
  drag down, swipe a transaction left to delete it (with Undo), light and dark themes.
- **Budgets and subscriptions**: monthly limits per category with a pace marker, and repeating charges found in your
  history with what is due next.
- **Category rules**: fix a category once and Kalyta remembers it for that place; Apple Pay records without a
  category wait in a quick review.
- **App lock**: Face ID or a 6-digit passcode, a switch that hides amounts (touch and hold to peek) and a blurred
  cover in the app switcher.

## How it fits together

```
iPhone (Kalyta PWA) ── HTTPS POST ──> Apps Script web app ──> Google Sheet
Apple Pay (Shortcuts) ── HTTPS POST ──┘                        ├─ Expenses
                                                               ├─ Accounts, Transfers, Balance history
                                                               ├─ Budgets, Subscriptions, Rules
                                                               └─ Overview, Details (sheet dashboards)
```

## Set up

1. **Script.** Open your sheet → Extensions → Apps Script and paste [`apps-script/Code.gs`](apps-script/Code.gs).
   Set `SECRET` (for the Apple Pay shortcut) and `VIEW_KEY` (for the app) to long random strings.
2. Run `setupDashboard` once and allow the permissions.
3. **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*. Copy the URL ending in `/exec`.
   After every code change: Manage deployments → Edit → New version.
4. **App.** Open the GitHub Pages site, tap *Connect Google Sheet* and paste the web app URL and `VIEW_KEY`.
5. In Safari: Share → Add to Home Screen.

### Updating from Kalyta 1.x

Kalyta 2.0 needs the new `Code.gs`: paste it over the old one and deploy a new version (Manage deployments → Edit →
New version). It adds editing transfers, balance adjustments (logged in *Balance history*, which gets *Change*, *Kind*
and *ID* columns), a *Checked* column on *Accounts*, today's exchange rates and the "Recreate tab" repair. Until you
redeploy, everything else keeps working and those actions show up as failed in Sync.

### Updating to Kalyta 2.1

Paste the new `Code.gs` again and deploy a new version. It adds three tabs, created on first use: *Budgets* (monthly
limits in USD), *Subscriptions* and *Rules* (the existing keyword → category list, now editable from the app), plus a
*Domain* column on *Accounts* for logos. Apple Pay records with an empty category show up in *Needs a category*.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (vitest)
npm run typecheck  # TypeScript 7 (native Go compiler)
npm run lint       # Biome
npm run build      # production build into dist/
```

Pushing to `master` builds and deploys to GitHub Pages (Settings → Pages → Source: GitHub Actions).

## Bank logos

Banks and exchanges in `BANKS` (`src/lib/meta.ts`) use their App Store icons from `public/logos`.
To add one, put it in `BANKS` and in `scripts/fetch-logos.mjs`, then run
`node scripts/fetch-logos.mjs <domain>` and commit the new file. Other websites fall back to their own icon.

## Stack

React 19, Vite 8, TypeScript 7, vite-plugin-pwa (Workbox), Biome, Vitest. Text uses the system font (SF Pro on
iPhone). Icons are a self-hosted subset of Material Symbols Rounded (about 24 KB); after using a new icon name, add it
to `scripts/fetch-icons.sh` and run the script.

## Privacy

The app keeps a copy of your data in the browser's local storage so it can work offline. The access key is
stored only on your device; it is never part of this repository.

App lock is local to the iPhone: the passcode is stored as a salted SHA-256 hash, and Face ID uses a passkey
(WebAuthn) that never leaves the device. If you forget the passcode, reconnect with the web app URL and `VIEW_KEY`;
your records stay in the Sheet. Account logos are site icons loaded from Google's favicon service and cached offline.
