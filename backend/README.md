# Orange Health Ajo — Backend

NestJS + Prisma + Postgres API for the member, receptionist, and admin dashboards.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up your environment

```bash
cp .env.example .env
```

Then open `.env` and fill in:
- `DATABASE_URL` — a real Postgres connection string. Easiest free option: create a free Postgres database on [Railway](https://railway.app) or [Neon](https://neon.tech), then paste the connection string it gives you.
- `JWT_SECRET` — any long random string. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `PAYSTACK_SECRET_KEY` — from your Paystack dashboard under **Settings → API Keys & Webhooks**. Use the **test** secret key (`sk_test_...`) while developing.
- `RESEND_API_KEY` — free account at [resend.com](https://resend.com). Leave `EMAIL_FROM` as the default `onboarding@resend.dev` until you have a verified domain — it works with zero setup for testing.

## 3. Generate the Prisma client and create your database tables

```bash
npx prisma generate
npx prisma migrate dev --name init
```

The first command reads `prisma/schema.prisma` and generates fully-typed database access code. The second actually creates the tables in your Postgres database, matching the schema.

If you ever change `schema.prisma`, re-run `npx prisma migrate dev --name <describe-the-change>`.

## 4. Create Dr. Megbuwawon's admin account

There's no API route that can create the very first admin — that's deliberate, since only an existing admin can create staff accounts (see below). Add these two lines to `.env`:

```
SEED_ADMIN_PHONE="080xxxxxxxx"
SEED_ADMIN_EMAIL="drmegbuwawon@example.com"
SEED_ADMIN_PASSWORD="choose-a-real-password"
```

Then run:

```bash
npx prisma db seed
```

From then on, every other receptionist or admin account gets created by logging in as an admin and calling `POST /auth/create-staff`.

## 5. Run it

```bash
npm run start:dev
```

The API starts on `http://localhost:3000` (or whatever `PORT` you set). It restarts automatically when you save a file.

## 6. Quick smoke test

Once it's running, try creating a member account:

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Member","phone":"08010000000","password":"password123"}'
```

You should get back an `accessToken` and a `user` object. That confirms Postgres, Prisma, and auth are all wired up correctly.

## What each folder is

- `src/auth/` — signup, login, JWT issuing and validation
- `src/funds/` — a member's Health Ajo and General Ajo balances and contribution frequency
- `src/transactions/` — Paystack payments and receptionist walk-in logging; this is the only place fund balances actually change
- `src/draw-requests/` — a member requesting to draw down their Health Ajo, and admin approval
- `src/next-of-kin/` — beneficiary details, including the receptionist-witnessed flow for members without smartphones, and a full change-history log
- `src/beneficiary-claims/` — a next-of-kin claiming a deceased member's General Ajo balance; always reviewed by an admin against the next-of-kin history, never automatic
- `src/common/` — shared guards and decorators (`@Roles()`, `@CurrentUser()`) used across every module

## Security review — what was checked, and what's still open

A deliberate pass was done to look for ways this could be exploited before it handles real money. Fixed:

- **Race condition in draw-request and claim approvals** — balance checks and decrements now happen as a single atomic database operation, so two near-simultaneous approvals can't both succeed past the actual available balance.
- **No way to create staff accounts** — added `POST /auth/create-staff` (admin-only) and a one-time seed script for the first admin.
- **No upper limit on walk-in contributions or claim amounts** — sanity ceilings added, so a typo or a bad-faith entry doesn't sail through unnoticed.
- **No rate limiting on login/signup** — added, tightened specifically on those two routes.
- **Next-of-kin could be silently changed with no record** — every change (self-edited or witnessed) now writes a permanent history entry, and any beneficiary claim review surfaces that full history plus how recently it changed.

Known gaps, not yet built — worth deciding on before launch, not silently ignored:

- **No password reset flow.** Needs an SMS OTP provider (e.g. Termii, Africa's Talking) to do properly for a mostly-phone-based user base — flagged rather than faked.
- **No audit log on read access** — a receptionist can look up any member's balance by phone, and there's currently no record of *who looked up whom*, only actions that move money. Worth adding if this becomes a real concern.
- **Cash handling itself can't be verified by software** — a receptionist logging a walk-in payment is trusted, the same way a physical ajo collector's book always was. The real protection is an operational one: daily reconciliation of logged walk-ins against actual cash collected, which is a process Orange Health needs to run, not something code alone can guarantee.

## Connecting the Paystack webhook (needed for real payments to actually credit a balance)

In your Paystack dashboard, set the webhook URL to:
```
https://your-deployed-domain.com/transactions/paystack/webhook
```
Paystack can't reach `localhost`, so for local testing use a tunnel tool like [ngrok](https://ngrok.com) and point the webhook at the ngrok URL instead.

## Known limitation from the AI sandbox this was built in

`npx prisma generate` couldn't fully complete inside the sandbox this project was built in, because that environment blocks the domain Prisma downloads its engine binary from. This is **not** a problem with the code — it's a restriction specific to that container. Running the commands in step 3 above, on your own machine or on a real deployment platform, will work normally.
