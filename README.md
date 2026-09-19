# TULA — National Legal Metrology Verification Platform

A working prototype (built for Smart India Hackathon) of an online verification
and digital certification system for weighing and measuring instruments under
the Legal Metrology Act, 2009 and Legal Metrology (General) Rules, 2011.

## What's included

- **`server/`** — Node.js + Express REST API, SQLite database (`better-sqlite3`),
  JWT authentication, photo upload handling.
- **`public/`** — the frontend: plain HTML/CSS/JS single-page app that talks to
  the API. No build step required.
- **`setup.sh`** — one-shot installer/deploy script for a fresh Ubuntu server.
- **`DEPLOY.md`** — step-by-step instructions to get this running on your Azure VM.
- **`nginx.conf.example`** / **`server/ecosystem.config.js`** — reverse proxy
  and process-manager configs used by `setup.sh`.

## Features

- Role-based accounts: **Instrument Owner**, **Legal Metrology Officer (LMO)**,
  **Government Approved Test Centre (GATC)**, **Department Administrator**.
- Owners submit applications for new/re-verification with instrument details
  and a photo.
- LMOs/GATCs accept applications, schedule an inspection date, then record
  inspection observations (standard used, readings, error, pass/fail).
- A **Pass** result auto-generates a QR-coded digital certificate, valid for
  one year from the verification date.
- Anyone can verify a certificate's authenticity and validity — no login
  required — by certificate number or by scanning its QR code.
- Admin dashboard: system-wide stats, all applications with filters, a
  stakeholder directory, and an expiry monitor sorted by nearest due date.

## Running it locally (before deploying)

```bash
cd server
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:4000`. Demo accounts (password `demo1234`):
`owner@demo.tula`, `lmo@demo.tula`, `gatc@demo.tula`, `admin@demo.tula`.

## Deploying to your Azure VM

See **[DEPLOY.md](./DEPLOY.md)** for the full walkthrough — it covers getting
the files onto the server, running `setup.sh`, opening the right port in the
Azure Portal, and going live.

## Known simplifications (worth knowing about for your SIH submission)

- **Registration is open to all roles.** In a real deployment, LMO/GATC/Admin
  accounts would be provisioned by the department rather than self-registered —
  worth mentioning in your presentation as a next step (e.g. an admin-approval
  queue for those three roles).
- **Single Node process, file-based SQLite DB.** Fine for a demo and for
  moderate real traffic; a production rollout at national scale would move to
  a managed Postgres/MySQL instance and possibly split the API into multiple
  instances behind a load balancer.
- **No SMS/email notifications yet** for the "alerts and reminders for
  expiring validity" requirement — the Expiry Monitor (admin) and dashboard
  banners (owner) currently surface this in-app rather than pushing
  notifications out. A background job + SMS/email provider would be the
  natural next addition.
- **Mobile app** — deferred, as discussed. The API is already separate from
  the frontend, so a React Native / Flutter app (or PWA wrapper) can call the
  same endpoints documented below without backend changes.

## API reference (for the eventual mobile app / documentation)

All endpoints are under `/api`. Authenticated endpoints expect
`Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create an account |
| POST | `/api/auth/login` | — | Log in, returns `{ token, user }` |
| GET | `/api/me` | any | Current user profile |
| POST | `/api/applications` | owner | Submit application (multipart, field `photo` optional) |
| GET | `/api/applications` | any | List applications (role-scoped automatically) |
| GET | `/api/applications/:id` | any | Application detail |
| POST | `/api/applications/:id/schedule` | lmo/gatc | `{ date }` — accept & schedule |
| POST | `/api/applications/:id/inspect` | lmo/gatc | `{ standard, before, after, error, result, remarks }` |
| GET | `/api/certificates` | any | List certificates (role-scoped) |
| GET | `/api/certificates/:id` | any | Certificate detail |
| GET | `/api/verify/:certNo` | — | Public certificate lookup (what a QR scan hits) |
| GET | `/api/stakeholders` | admin | All registered users |
