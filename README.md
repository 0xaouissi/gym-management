# Gym Manager

Offline-first desktop application for gym staff: clients, RFID cards, subscriptions, payments and
turnstile access control — built with Electron, React and TypeScript.

Every access decision (open / deny / why) is made in the **backend main process** and written to an
access log. The UI never decides access on its own.

## Modules

| Page             | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| Dashboard        | Key numbers, charts, today's entries, expiring subscriptions, live activity feed |
| Live Access      | Real-time scan verdicts (allowed / denied with reason), manual & simulated scans |
| Clients          | Client records, status (Active / Inactive / Blocked), photo, history             |
| Subscriptions    | Create, renew, extend, suspend, resume and cancel subscriptions                  |
| RFID Cards       | Issue, replace, block, unblock, mark lost and revoke cards                       |
| Access Control   | Full access log with filters (date range, result, client, search)                |
| Attendance       | Daily attendance derived from allowed entries, printable/exportable              |
| Payments         | Record payments (cash, card, transfer, other), receipts, outstanding balances    |
| Reports          | Revenue, subscriptions, attendance, clients — export to CSV / Excel / PDF        |
| Settings         | Gym info, currency, theme, RFID reader and ZK TS1000 turnstile configuration     |
| Users            | Staff accounts (Administrator / Receptionist), password resets                   |
| Audit            | Immutable audit trail of every sensitive action                                  |

## Tech stack

- **Electron 44** + **electron-vite 5** (main / preload / renderer)
- **React 19** + **TypeScript 5.9** (strict) + **Tailwind CSS 4** + Radix-based UI components
- **SQLite** through Node's built-in `node:sqlite` — no native modules, no server
- `recharts`, `lucide-react`, `sonner`, `date-fns`, `exceljs`, `jspdf`
- **Vitest 5** for automated tests

## Requirements

- Windows 10/11 (the packaged app is a `.exe` installer)
- Node.js 22+ for development (Node 24 recommended — `node:sqlite` is built in)

## Getting started (development)

```bash
npm install       # install dependencies
npm run dev       # start the app with hot reload
```

On first launch the app shows a **setup screen** — create the administrator account (username +
password). Passwords are hashed with scrypt (random salt, timing-safe comparison); plain-text
passwords are never stored.

Optional: `npm install serialport` if you want real COM-port hardware during development
(see `HARDWARE.md`). The app runs fine without it.

## Useful commands

| Command               | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Run the app in development with hot reload                  |
| `npm test`            | Run the Vitest suite (access rules, renewals, card rules)   |
| `npm run test:watch`  | Vitest in watch mode                                        |
| `npm run typecheck`   | Type-check main, preload, renderer and tests                |
| `npm run build`       | Bundle main/preload/renderer into `out/`                    |
| `npm run package`     | Build a Windows NSIS installer (`.exe`) via electron-builder|
| `npm run package:dir` | Build an unpacked app folder (no installer) for quick tests |
| `npm run package:protected` | Obfuscated release build → `../Gym Manager Production`  |

## Trying it without hardware

The app ships in **mock mode** (Settings → RFID reader / Turnstile both set to `Mock`):

- **Live Access → Simulate RFID scan** — triggers a scan as if a reader had fired. The default
  UID is `AABBCCDDEE`; enter any UID you have registered.
- **Settings → Test open** (turnstile card) — exercises the turnstile controller.
- **Dashboard → Generate demo data** (administrator, empty database only) — fills the app with
  realistic clients, subscriptions, payments and access logs so you can explore every screen.

## How access works

```
RFID reader ──► HardwareManager ──► AccessService.validateAccess()   (main process)
                                        │
                        allowed ────────┴──────── denied
                           │                        │
                 turnstile.open()          reason recorded
                           │                        │
                           └──────► access_logs ◄──┘   (every attempt is logged)
```

Denial reasons surfaced to staff: `UNKNOWN_CARD`, `CARD_BLOCKED`, `CARD_REVOKED`, `CARD_LOST`,
`CLIENT_BLOCKED`, `CLIENT_INACTIVE`, `NO_SUBSCRIPTION`, `SUBSCRIPTION_EXPIRED`,
`SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_CANCELLED`.

### Business rules enforced by the backend

1. A UID can belong to only one live card (DB-level unique constraint).
2. Blocked, lost or revoked cards never open the turnstile.
3. Blocked or inactive clients never open the turnstile.
4. No subscription → no entry.
5. Expired subscriptions never open the turnstile (even if still marked ACTIVE).
6. The most recent subscription (by end date) is the one evaluated.
7. Every scan attempt is logged — allowed or denied, hardware available or not.
8. The turnstile is opened **only** after the backend authorizes the scan.
9. Renewing an active subscription extends from its current end date; renewing an expired one
   restarts from today.
10. Timestamps are stored in UTC and displayed in local time.

### Roles & security

| Capability                                   | Administrator | Receptionist |
| -------------------------------------------- | :-----------: | :----------: |
| Clients, subscriptions, payments, cards      |      ✅       |      ✅      |
| Live access, logs, attendance, reports       |      ✅       |      ✅      |
| RFID / turnstile configuration, users, audit |      ✅       |      ❌      |

- Login is required before any screen is shown; sessions live in the main process.
- Passwords: scrypt hashes with random salts — never stored or logged in plain text.
- Hardware and user-management IPC calls are guarded on the backend; hiding buttons is only a
  convenience, not the security boundary.
- The last active administrator cannot be disabled, demoted or deleted.

## Data & storage

- Everything is local — the app is fully offline and needs no network.
- Database file: `%APPDATA%\Gym Manager\gym-manager.db` (SQLite, WAL mode). The exact path is
  shown in Settings → Hardware status. Back it up by copying this file.
- Seed data: three monthly session plans — 13 Sessions / Month `1800`, 17 Sessions / Month `2000`,
  22 Sessions / Month `2200` DZD. Subscriptions and renewals accept a month count (1–36) that
  extends the period and multiplies the plan price (editable before saving). Prices and plans are
  editable in the app.

## Tests

```bash
npm test
```

`tests/access.test.ts` covers every access scenario end-to-end against a real in-memory SQLite
database (all denial reasons, normalization, re-issued UIDs, turnstile-open-only-when-allowed,
logging guarantees, card uniqueness). `tests/renewal.test.ts` covers renewal extend-vs-restart
semantics, plan period calculation and the expiry sweep.

## Project layout

```
src/
  main/            Electron main process — the only place that talks to the DB and hardware
    db/            SQLite wrapper, schema & migrations
    services/      Business logic (auth, clients, subscriptions, access, payments, ...)
    hardware/      Reader & turnstile adapters + manager (see HARDWARE.md)
    ipc.ts         Typed IPC handlers with role guards
  preload/         contextBridge exposing window.api (typed as GymApi)
  renderer/        React UI (pages, components, hooks)
  shared/          Types, IPC channel names, constants, date/currency helpers
tests/             Vitest suites
```

## Packaging a Windows installer

```bash
npm run package
```

The NSIS installer is written to `dist/`. The installer and the app are fully offline; SQLite comes
from Node, so no extra runtime is needed.

### Obfuscated (protected) build

```bash
npm run package:protected
```

Same installer, but every bundled `.js` file is passed through `javascript-obfuscator`
(`scripts/obfuscate-build.cjs`) before packaging: hexadecimal identifiers, a base64 string table and
compact output make the shipped code practically unreadable. Output goes to
`../Gym Manager Production/` (a folder next to the project) and `dist/` is left untouched.
Note that obfuscation raises the effort needed to copy or modify the code, but it is not encryption —
a determined reverse-engineer can still study the bundle.

## Hardware

See **[HARDWARE.md](HARDWARE.md)** for reader/turnstile modes, ZK TS1000 wiring, serial port
support, keyboard-wedge details and troubleshooting.

## License

[MIT](LICENSE)
