# Muse — Studio Booking App

A modern web app for managing studio schedules, instructors, and bookings. Built with Next.js, TypeScript, and a lightweight serverless API for availability, bookings, and studio settings.

**Key features**
- **Booking flow:** Browse availability and book sessions.
- **Instructor schedules:** View and manage instructor availability.
- **Staff admin:** Admin dashboard for managing studio settings and bookings.
- **Email notifications:** Queued email delivery for booking confirmations.

**Tech stack**
- **Framework:** Next.js (App router)
- **Language:** TypeScript
- **Styling:** CSS Modules + global styles
- **Testing:** Vitest + Playwright (E2E)
- **Database:** Postgres (migrations in /migrations)

**Quick start**
1. Install dependencies

```bash
pnpm install
```

2. Create a `.env` file (see `.env.example` if present) and set database and email credentials.

3. Run migrations

```bash
pnpm run migrate
```

4. Start development server

```bash
pnpm dev
```

**Testing**
- Run unit tests:

```bash
pnpm test
```

- Run end-to-end tests:

```bash
pnpm e2e
```

**Repository layout (important files)**
- `app/` — Next.js app routes and components
- `app/api/` — Server routes for bookings, availability, staff, and settings
- `lib/` — Shared server and client utilities (auth, database, email)
- `migrations/` — SQL migrations
- `tests/e2e/` — Playwright end-to-end tests

**Deploy**
Deploy to your chosen platform (Vercel, Railway, or similar). Ensure env vars and database are configured, then build:

```bash
pnpm build
```

**Contributing**
- Open an issue for bugs or feature requests.
- Send PRs against `main` with clear descriptions.

**License & contact**
This project is provided as-is. For questions or help, open an issue or contact the maintainer.

