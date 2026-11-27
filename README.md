# OttoAppHub 🐾

A community-run directory of **ClawHub plugins and skills made for [Otto](https://myotto.ai)** users.

- Anyone can create an account (username + email + password) and submit a plugin or skill link.
- Other users test listings and file reports: **✓ works**, **⚠ broken**, **⛔ unsafe**.
- Listings show community report counts at a glance.
- Everything is clearly marked: **code is untested by OttoAppHub — use at your own risk.**

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18 + Vite (static SPA in `dist/`) |
| Backend   | One Netlify Function (`netlify/functions/api.mjs`) mounted at `/api/*` |
| Database  | Neon Postgres (serverless driver) |
| Auth      | Email + password (bcrypt), DB-backed session tokens in an httpOnly cookie |

No framework lock-in: the API is a single plain Node handler, and the dev server (`scripts/dev-server.mjs`) runs it exactly like Netlify does.

## Local development

```bash
npm install --include=dev
npm run dev        # builds the SPA, serves site + API on http://localhost:8888
```

Without `DATABASE_URL` the API uses an **in-memory store** (data resets on restart) so you can develop with no database. To develop against Neon, put your connection string in `.env`:

```
DATABASE_URL=postgres://...   # from the Neon console (pooled connection)
```

## Deploying to Neon + Netlify

### 1. Neon

1. Create a project at [neon.tech](https://neon.tech) (free tier is fine).
2. Copy the **pooled** connection string.
3. Apply the schema — either paste `migrations/001_init.sql` into the Neon SQL Editor, or:
   ```bash
   DATABASE_URL="postgres://..." npm run migrate
   ```

### 2. Netlify

1. Push this repo to GitHub and **Add new site → Import an existing project** in Netlify.
2. Build settings are in `netlify.toml` (build `npm run build`, publish `dist`, functions `netlify/functions`) — nothing to configure.
3. Site settings → Environment variables: add `DATABASE_URL` with your Neon pooled connection string.
4. Deploy. `/api/*` is routed to the function by the redirect in `netlify.toml`.

> **Note:** if `npm ci` on Netlify skips devDependencies, add `npm update -g npm` to the build command or set `NODE_ENV=development` for the build only — Vite is a devDependency.

## API overview

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/signup` | – | Create account (sets session cookie) |
| POST | `/api/auth/login` | – | Log in |
| POST | `/api/auth/logout` | – | Log out |
| GET  | `/api/me` | – | Current user |
| GET  | `/api/listings?type=&q=&sort=new|top` | – | Browse/search |
| POST | `/api/listings` | ✓ | Submit a plugin/skill |
| GET  | `/api/listings/:id` | – | One listing + reports |
| DELETE | `/api/listings/:id` | ✓ (owner) | Delete own listing |
| POST | `/api/listings/:id/reviews` | ✓ | File/update a testing report (`works`/`broken`/`unsafe`) |
| GET  | `/api/mine` | ✓ | Your submissions |

## Safety posture

- Submissions are **not** vetted by us; the UI states this in a banner on the home page, every listing, and the footer.
- User-submitted links are `rel="noopener noreferrer nofollow"`.
- Only `http(s)` URLs are accepted; bodies are size-capped; HTML is never rendered from user content (React escapes).
- Sessions: random 256-bit tokens, 30-day expiry, httpOnly + SameSite=Lax cookies.
- TODO for v2: rate limiting on auth endpoints, a simple flag/moderation queue, report reasons beyond the three verdicts.
