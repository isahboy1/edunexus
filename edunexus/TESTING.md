# Testing

Test suites for the EduNexus platform (Next.js on `:57362` + Laravel API on `:8000`, shared Postgres): HTTP-level smoke suites, node:test unit tests, and Laravel Pest feature tests. CI (`.github/workflows/smoke.yml`) runs preflight, both smokes, the unit tests and `php artisan test` on every push.

## Prerequisites

- **Postgres** running natively on `:5433` (Docker Desktop not required).
- **Laravel API**: `cd edunexus/api && php artisan serve` (listens on `:8000`).
- **Next.js production server**: `cd edunexus && npm run build && npm run start -- -p 57362`. Do **not** use `next dev` for smoke tests — its manifests/cookies behave differently.
- **Seeded data**: run both seeders so the DB has the demo staff accounts and an open admission window. Both seeders read the shared `edunexus/seed-credentials.json` (8 staff accounts, password `Admin@12345`), and the Laravel seeder sets the admission window **relative to today** (opens −30 days, closes +120 days), so a fresh seed always yields a valid window:

  ```bash
  cd edunexus/api && C:/xampp/php/php.exe artisan db:seed
  cd edunexus && npm run db:seed
  ```

## Suites

| Command | What it runs |
|---|---|
| `npm run preflight` | `scripts/preflight.mjs` only — health check |
| `npm run smoke` | preflight + `scripts/smoke.mjs` |
| `npm run smoke:testimonials` | preflight + `scripts/smoke-testimonials.mjs` |
| `npm run smoke:lecturer` | preflight + `scripts/smoke-lecturer.mjs` |
| `npm test` | unit tests (`tests/`, node:test — no server or DB needed) |
| `npm run ci:dry-run` | validates `.github/workflows/smoke.yml` locally (YAML, `bash -n` on every step, env-var consumers) |
| `cd api && composer smoke` | API-only admissions lifecycle (`api/scripts/smoke.php`, 39 checks) |
| `cd api && php artisan test` | Pest feature tests (38 tests / 162 assertions) |

### Preflight — backend health check

Probes `GET {NEXT_URL}/login` and `GET {API_URL}/public/settings` (10s timeout each). Prints ✓/✗ per backend with startup hints, exits `1` if either is down — so the smoke suites never run against a half-up stack. Both smoke scripts run it first automatically.

Env overrides: `NEXT_URL` (default `http://localhost:57362`), `API_URL` (default `http://127.0.0.1:8000/api/v1`).

### `npm run smoke` — admissions lifecycle (8 sections, 64 checks)

Full end-to-end pass against Laravel (`:8000`, positional arg `node scripts/smoke.mjs <api-base>` overrides) plus a few Next.js page checks:

1. **Public surface** — public settings, programmes list, homepage/programme pages render.
2. **Applicant registration (FR-001)** — create applicant account, login, duplicate-email rejection.
3. **Application lifecycle** — create draft application, edit, programme/entry-mode validation.
4. **Document uploads** — upload required documents, list/verify them, reject invalid ones.
5. **Payment flow** — initiate payment, server-side verification only (no real gateway), status transitions.
6. **Submission & acknowledgement slip** — submit application, lock edits, fetch slip.
7. **Admin review & admission** — staff login (`Admin@12345`), review application, admit applicant, plus a hermetic bulk-admit check built on a second applicant driven through the full flow (every setup step is asserted, so a dropped request fails immediately at its own step).
8. **Admission acceptance → student** — applicant accepts offer; account becomes a student. (Exits early if no admission exists — run sections in order.)

### `npm run smoke:lecturer` — results chain (7 sections, 39 checks)

Walks the SRS results workflow end-to-end against seeded demo data (reseed if it fails: `cd api && php artisan db:seed`), and is idempotent across runs:

1. **RBAC gates** — roster requires auth; a student token is rejected on lecturer routes.
2. **Roster & draft entry** — assigned courses (GSS 101, EAP 101) with the enrolled demo student; unassigned-course save refused (403); exam >60 rejected; draft save → grade computed server-side (73 → A).
3. **Approval chain** — submit locks results; re-submit without drafts → 422; row appears in the admin approval ledger; publish-before-approve rejected; ACADEMIC_OFFICER approves.
4. **HOD privileges** — HOD may APPROVE but is forbidden to PUBLISH (403); re-approving is rejected (422).
5. **Publication & student visibility** — academic officer publishes; the grade + GPA appear on the student transcript; a "Result published" in-app notification is recorded; draft rows stay invisible.
6. **Reject path** — a submitted result rejected by the admin stays REJECTED until the lecturer re-enters scores; a PUBLISHED result cannot be rejected.
7. **Recovery loop** — the full second-chance workflow: the lecturer re-opens a published course with a new draft, the revision is rejected by the admin, corrected scores are re-entered and resubmitted, then approved, published, and verified on the transcript.

### `npm test` — unit tests (69 tests, no server needed)

Run by `node --test` via tsx; nothing listens on a port and no database is touched:

- `tests/lib/testimonials.test.ts` — the validation schemas behind `POST`/`PATCH /api/v1/admin/testimonials` (field limits, status enum, `displayOrder` bounds), the `publishedAt` transition rules (first publish stamps `now()`, republish preserves the stamp, unpublish/archive clear it, absent status leaves it untouched), and the homepage render rule (published + `displayOrder < 3`).
- `tests/lib/seed-credentials.test.ts` — the shared `seed-credentials.json` contract both seeders depend on: shape validation, duplicate-email rejection, `SEED_ADMIN_PASSWORD` override, plus assertions on the real file (all 8 staff roles present, smoke-test logins exist).
- `tests/lib/validators.test.ts` — the applicant-wizard section schemas (register, biodata personal, contact, programme, JAMB, O-Level, qualifications) pinned to the exact payloads the smoke suite drives through the live API, including the 5-subject O-Level rule the submission gate depends on.

The logic under test lives in `src/lib/testimonials.ts` and `src/lib/seed-credentials.ts`, extracted from the route handlers and `prisma/seed.ts` so the suites stay thin and testable.

### `npm run smoke:testimonials` — testimonials pipeline (13 checks)

Exercises the Next.js session-cookie pipeline (`jar` replays the `edunexus_session` cookie from `Set-Cookie`; the cookie is `Secure`+`HttpOnly`, so requests must target `http://localhost:57362`, **not** `127.0.0.1`):

- Staff login via Next session auth; unauthenticated/draft-proof checks (draft testimonials invisible publicly).
- Create draft → verify hidden on homepage → publish → verify it renders on the homepage (published rows are `take(3)` ordered by `displayOrder` asc; the probe uses `displayOrder: 0` to land on the homepage).
- Unpublish → re-publish → delete, verifying visibility at each step.

## Keeping the demo admission window fresh

The Laravel seeder now seeds the window relative to today (opens −30 days, closes +120),
but an existing database can still age out. `admissions:refresh-window` re-anchors it:

```bash
cd api && php artisan admissions:refresh-window [--dry-run] [--open-days=30] [--days=120]
```

It only touches **active** windows that expire within 30 days — admin-configured
far-future windows are never modified, and repeated runs are idempotent. A weekly run is
scheduled in `routes/console.php` (Mon 06:00). On this Windows machine the scheduler runs
via `api/scripts/scheduler.ps1` (`-Status` / `-Stop` / `-Install`), started at logon by
`EduNexus Scheduler.cmd` in the user's Startup folder; check
`api/storage/logs/scheduler-*.log` and `artisan schedule:list` if jobs seem to skip.

## Notes

- Laravel lockout: 5 failed logins lock an account — if smokes fail on login, re-seed or clear `failed_logins`/`locked_until`.
- Demo credentials for all suites: see `edunexus/seed-credentials.json` (single source of truth for both seeders).
- On low-RAM machines (8GB), build with `NODE_OPTIONS="--max-old-space-size=4096" npx next build`.
