# Recruitment Grader

A web application for scoring recruitment applications. Admin uploads a CSV, assigns graders, and the system randomly distributes applications. Graders score each application via a private link. Admin finalizes results with averaged scores and tie detection.

## Local Development

### 1. Set up Turso (free)

1. Sign up at [turso.tech](https://turso.tech)
2. Install the CLI: `brew install tursodatabase/tap/turso`
3. Log in: `turso auth login`
4. Create a database: `turso db create recruitment`
5. Get the URL: `turso db show recruitment --url`
6. Create an auth token: `turso db tokens create recruitment`

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Fill in TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
```

### 3. Run

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/setup`.

---

## How It Works

### Setup (admin)

1. Go to `/setup`
2. Upload your CSV file (any format — all columns are detected automatically)
3. Select which columns are **scored** (1–5) vs **context only** (shown to graders but not scored)
4. Enter graders: one `Name, email` per line (minimum 2 graders required)
5. Submit — you'll receive:
   - An **admin dashboard link** with your admin token (save it!)
   - A **grader link** per grader — share these via email

### Grading

Each grader visits their unique link and scores their assigned applications (each application is assigned to exactly 2 graders). They can stop and resume at any time — scores are saved on each submission.

### Admin Dashboard

- Visit `/admin/dashboard` and enter your admin token to sign in
- See real-time grading progress per grader and overall
- Expand any application row to see per-field score breakdown from each grader
- When ready, enter a top N number and click **Finalize**

### Results

After finalizing:
- Applications are ranked by average score (all scored field responses from both graders, averaged together)
- **Ties are highlighted in yellow** — manual review can break them
- Export all results to CSV with the **Export CSV** button

### New Round (every 6 months)

After finalizing, click **New Round** on the dashboard to wipe all data and return to `/setup` for the next cycle.

---

## Deployment: Vercel + Turso (both free)

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel project settings:
   - `TURSO_DATABASE_URL` — from `turso db show recruitment --url`
   - `TURSO_AUTH_TOKEN` — from `turso db tokens create recruitment`
4. Deploy

The DB schema is created automatically on first request — no migrations needed.

---

## Running Multiple Independent Instances

Each instance needs its own Vercel project and its own Turso database. Both are free.

For each additional instance:

1. **Create a new Turso database** in the Turso dashboard (different name each time). Copy its URL and auth token.
2. **Import the same GitHub repo** as a new Vercel project (Vercel → New Project → select the repo again).
3. **Set the new env vars** for that Vercel project (`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from step 1).
4. **Deploy.** Each project gets its own URL and a completely independent database.

Pushing code changes to the repo redeploys all projects automatically.

---

## Resetting a Database

Run these in the Turso shell (dashboard → your database → Shell tab):

```sql
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS graders;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS config;
```

Then visit `/setup` to start fresh.

---

## Recovering Admin Password

In the Turso shell:

```sql
-- View current password
SELECT admin_token FROM config WHERE id = 1;

-- Or set a new one
UPDATE config SET admin_token = 'newpassword' WHERE id = 1;
```
