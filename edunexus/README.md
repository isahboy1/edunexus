# EDUNEXUS — Integrated Academic & Student Management System

A centralized web platform for EDUNEXUS: public website, applicant portal (admissions),
student portal and administration.

## Architecture (two-tier, per SRS §51/§53)

```
Next.js 16 (web/applicant/admin/student UIs, logo-branded)
        │  fetch + Bearer token (Sanctum)
        ▼
Laravel 13 API  ──  edunexus/api   (auth, RBAC, business rules, audit)
        │  PDO
        ▼
PostgreSQL 17  (edunexus_laravel database, port 5433)
```

- **`edunexus/`** — the Next.js frontend (all portals share it) + legacy Prisma schema kept for reference.
- **`edunexus/api/`** — the dedicated Laravel backend serving **web + mobile + third-party apps** as an
  independent API platform. 40 tables, 30 Eloquent models, Sanctum token auth, RBAC middleware,
  signature-verified payment webhooks (Mock gateway today, Remita RRR + Paystack adapters ready),
  and the full admissions state machine.

### Verified end-to-end

`scripts/smoke.mjs` walks the entire SRS §60 lifecycle against the Laravel API plus the
Next.js integration points — **64/64 checks green**:
register → login (lockout, duplicates) → application → nested section saves → document
uploads (MIME/size, private disk) → payment initialise (RRR/checkout reuse) →
unsigned/forged webhook 401 → signed webhook via the Next proxy → server-verified payment
→ submit gate → acknowledgement-slip PDF (Next route) → admin review/shortlist/admit →
acceptance → **matric number + student conversion** → RBAC enforcement.

`api/scripts/smoke.php` covers the API lifecycle directly (39 checks). Pest feature tests:
`cd api && php artisan test` — **38/38 green** (admissions state machine, webhook security,
RBAC).

---

## Quick start

```bash
# 1. PostgreSQL (choose one)
docker compose up -d                      # Docker (maps host 5433 -> container 5432)
#   or the bundled local setup (Windows):
#   ~/pgsql/bin/pg_ctl -D ~/pgsql/data-edunexus -o "-p 5433" start

# 2. Backend API (Laravel, PHP 8.4)
cd api
cp .env.example .env                      # set DB_PORT=5433, DB_DATABASE=edunexus_laravel,
                                          # PAYMENT_GATEWAY=mock,
                                          # PAYMENT_WEBHOOK_SECRET=dev-webhook-secret-change-me,
                                          # FRONTEND_URL=http://localhost:3000
composer install
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000   # http://127.0.0.1:8000

# 3. Frontend
cd ..
npm install
# .env.local: NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
#             PAYMENT_WEBHOOK_SECRET=dev-webhook-secret-change-me   (same as api/.env)
npm run dev                               # http://localhost:3000
```

## Getting started

Demo credentials work identically on **both** stacks — the Laravel seeder and the Next.js
Prisma seeder read the same [seed-credentials.json](seed-credentials.json), so the accounts
can never drift apart. Password for every staff account: `Admin@12345` (the Next seeder
also honours a `SEED_ADMIN_PASSWORD` env override).

| Role               | Email                      |
|--------------------|----------------------------|
| Super Admin        | admin@edunexus.edu.ng      |
| Sub-Admin (user mgmt only) | subadmin@edunexus.edu.ng |
| Registrar          | registrar@edunexus.edu.ng  |
| Admissions Officer | admissions@edunexus.edu.ng |
| Academic Officer   | academic@edunexus.edu.ng   |
| Bursary Officer    | bursary@edunexus.edu.ng    |
| HOD                | hod@edunexus.edu.ng        |
| Lecturer           | lecturer@edunexus.edu.ng   |

Applicants are not seeded — register through the portal with any email and password.

### Verification suites

```bash
npm run smoke                  # preflight + full admissions lifecycle (8 sections, 64 checks)
npm run smoke:testimonials     # preflight + testimonials draft→publish→delete pipeline (13 checks)
npm run smoke:lecturer         # preflight + lecturer results chain incl. the /admin/results approval UI (8 sections, 54 checks)
npm test                       # Next unit tests (route logic; no server needed)
npm run ci:dry-run             # lint the GitHub Actions workflow locally
cd api && composer smoke       # API-only admissions lifecycle (39 checks)
cd api && php artisan test     # Pest feature tests (38 tests)
```

Both HTTP smoke suites first run a **preflight** health check and refuse to start unless
the Next server (`:57362`) and the Laravel API (`:8000`) are both reachable. Ports,
per-suite coverage details and troubleshooting live in [TESTING.md](TESTING.md).

---

## What is implemented

**Public website** — homepage with admission call-to-action (fee + deadline read from
settings), programmes catalogue grouped by faculty, admissions guide, news, announcements,
contact.

**Applicant portal** — account registration with validation + lockout, login/logout,
dashboard with progress checklist, 8-step application wizard (Personal → Contact →
Programme → JAMB → O-Level → Documents → Payment → Review/Submit), document uploads
(PDF/JPG/PNG, size-limited, securely renamed, stored outside the web root, versioned),
mock-gateway payment flow, submission with declaration and completeness checks,
**acknowledgement slip PDF with QR code**, admission-status tracking, admission acceptance.

**Administration** — dashboard KPIs, filterable admissions queue, full application review
dossier (personal, programme, JAMB, O-Level, documents, payments, timeline), actions
(review / shortlist / screening / request-correction / reject / **admit**), institution
settings + per-session admission window (fee, deadline, open/close, allowed application
types), audit-log viewer, staff user creation, academic structure API.

**Student conversion** — accepting an admission atomically creates the Student record with
matric number (`EDU/<year>/<seq>`), links the admission, grants the STUDENT role, and
notifies the applicant. Duplicate conversion is impossible.

**Student portal** — `GET /student/me|fees|payments|registration-documents`, course
registration (12–24 credit-unit ceiling, HOD approval then final approval), registration
forms (SIF, CRF, undertaking, library form) with print view, registration slip, and the
bursary confirmation checkpoints (bank payment confirm / gateway verify).

**Payments** — `PaymentGateway` interface with **Mock** (dev) and **Remita RRR** adapters.
The Remita flow generates an RRR, shows the bank-payment instruction page
(`/payments/remita-instruction`, polls the API, dev simulate button), and only the
HMAC-SHA512-signed webhook (or bursary confirmation) ever marks a transaction SUCCESSFUL —
unsigned/forged webhooks are rejected with 401 and the gateway is re-verified server-side.

**Security & audit** — RBAC across 9 roles, Sanctum bearer tokens (12h) kept in a
JS-readable `edunexus_token` cookie, bcrypt password hashing, login lockout (5 fails / 15
min), immutable audit log for every sensitive action, standard JSON envelope
(`{ok, message?, data}`) on all `/api/v1` endpoints.

### End-to-end verification

```bash
cd api && php artisan serve --port=8000 &
npm start -- -p 3000 &
npm run smoke   # walks the whole lifecycle (8 sections, 64 checks)
```

---

## API overview (`/api/v1`)

```
POST /auth/register|login|logout          GET /auth/me

GET|POST /applicant/applications          GET|PATCH /applicant/applications/{id}
POST /applicant/applications/{id}/submit  GET  /applicant/applications/{id}/slip
POST /applicant/applications/{id}/payments
POST|GET|DELETE /applicant/applications/{id}/documents[/{docId}]
GET  /applicant/admission-status          POST /applicant/admissions/{id}/accept

POST /payments/webhook (HMAC-signed)      GET  /payments/{reference}
POST /bursary/payments/{reference}/confirm|verify

GET  /student/me|fees|payments|registration-documents|courses/eligible
GET|PUT /student/registration             POST /student/registration/submit|{item}/drop
GET  /student/registration/slip           GET  /admin/registrations
POST /admin/registrations/{id}/approve     {action: HOD_APPROVE|FINAL_APPROVE|REJECT}

GET  /programmes                          GET  /public/admission-info|settings|news|announcements
GET  /admin/stats|applications|applications/{id}|audit-logs|users|settings|admission-windows/{id}
POST /admin/applications/{id}/actions     {action: REVIEW|SHORTLIST|SCREENING|REQUEST_CORRECTION|REJECT|ADMIT}
PUT  /admin/settings|admission-windows/{id}   POST /admin/users|admissions/{id}/revoke
```

## Brand assets

The brand source images live in the **repository root** (one level above `edunexus/`),
unreferenced by code — the UI loads its logo/login art from the `SystemSetting`
branding (`/api/v1/branding/*`), and `public/slides/*.svg` are the only tracked
image assets the site renders:

- `ChatGPT Image Sep 23, 2026, 04_40_45 PM.png` — concept art (860 KB)
- `ChatGPT Image Sep 23, 2026, 04_42_18 PM.png` — concept art (1.2 MB)
- `EduNexus.jpg` — brand logo/wordmark (1.2 MB)

They are committed for safekeeping; move them into a tracked assets folder (and update
this note) before referencing them from code or build tooling.

## Configuration (`SystemSetting` / `ApplicationSetting`)

Institution name/branding, matric + admission number prefixes, application fee per session,
application open/close windows, allowed application types — all editable by admins from
**Admin → Settings** (no code changes).

## Roadmap (per SRS phases)

Phase 3: student fee assessment, invoices, receipts, course registration with approval
chain. Phase 4: lecturer portal, result entry/approval, GPA/CGPA, transcripts. Phase 5:
reports, document QR verification endpoints, advanced analytics.
