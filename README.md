# Kalyta

A personal finance app that lives on your phone and keeps its data in your own Google Sheet.
Log spending, income, transfers between your accounts and account balances; see where the money went
by month and category, and how much you have across all accounts.

- **Installable PWA**: add it to the home screen and it runs full screen like a native app.
- **Works offline**: entries you add without a connection wait on the device and sync later.
- **No server**: a Google Apps Script bound to your sheet is the backend; the app is static files on GitHub Pages.
- **Multi-currency**: everything is converted to USD at NBP rates (via PLN) by the script.

## How it fits together

```
iPhone (Kalyta PWA) ── HTTPS POST ──> Apps Script web app ──> Google Sheet
Apple Pay (Shortcuts) ── HTTPS POST ──┘                        ├─ Expenses
                                                               ├─ Accounts, Transfers, Balance history
                                                               └─ Overview, Details (sheet dashboards)
```

## Set up

1. **Script.** Open your sheet → Extensions → Apps Script and paste [`apps-script/Code.gs`](apps-script/Code.gs).
   Set `SECRET` (for the Apple Pay shortcut) and `VIEW_KEY` (for the app) to long random strings.
2. Run `setupDashboard` once and allow the permissions.
3. **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*. Copy the URL ending in `/exec`.
   After every code change: Manage deployments → Edit → New version.
4. **App.** Open the GitHub Pages site, go to Settings, paste the web app URL and `VIEW_KEY`.
5. In Safari: Share → Add to Home Screen.

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

## Stack

React 19, Vite 8, TypeScript 7, vite-plugin-pwa (Workbox), Biome, Vitest. Fonts: Unbounded and Onest.

## Privacy

The app keeps a copy of your data in the browser's local storage so it can work offline. The access key is
stored only on your device; it is never part of this repository.
