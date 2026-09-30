# Security audit — isahboy1/edunexus public-readiness

Date: 2026-09-30 · Scope: entire git history (`2f6b5ed` + `71fc295`, 2 commits, 311 files)

## Verdict: **safe to make public** — no real secrets in history

## What was scanned
- Tracked-file inventory for `.env*` / credential-shaped filenames
- `git grep` over **all commits** for: private key blocks, `ghp_`/`github_pat_` tokens,
  AWS `AKIA…` keys, `sk_live_` payment keys, committed `APP_KEY=base64:…` values,
  assignment-style `AUTH_SECRET`/`DB_PASSWORD`/`*_SECRET`/`*_KEY` literals,
  `postgresql://` connection strings, hardcoded password literals in code

## Findings

| # | Item | Risk | Assessment |
|---|------|------|------------|
| 1 | `edunexus/seed-credentials.json` (default password `Admin@12345`, 8 staff emails) | Low (by design) | Demo/staff seed contract consumed by both seeders and the smoke suites. Equivalent to Laravel's framework-seeded demo users. **The only publication consideration.** |
| 2 | `Admin@12345` in 9 other files (tests, smokes, docs) | None | Same demo password echoed in test code and documentation. |
| 3 | `.env` files | None | **Zero `.env*` files tracked in history** — the earlier leak (libcurl cookie jar) was deleted pre-commit; `api/storage/scheduler.pid` was unstaged pre-commit. |
| 4 | Private keys / PATs / AWS / live payment keys / committed `APP_KEY` | None | No matches in any commit. |
| 5 | `.github/workflows/smoke.yml` literals (`DB_PASSWORD=postgres`, `PAYMENT_WEBHOOK_SECRET=dev-webhook-secret-change-me`, empty `APP_KEY=`) | None | Ephemeral CI service-container password and obvious placeholder; `APP_KEY` is generated at runtime (`php artisan key:generate`). |
| 6 | `postgresql://` literals | None | Only in the CI workflow, pointing at its own throwaway `postgres:17` service container. |
| 7 | Password literals in PHP/TS code | None | Validation rules, `UserFactory` default `'password'`, and the smoke suite's self-registered throwaway account (`Passw0rd123`). |
| 8 | Git remotes/config | None | Remote is a plain `https://github.com/isahboy1/edunexus.git` URL — no embedded token. |

## Standing caveat (documented, not a blocker)
Anyone deploying EduNexus to a **real** institution must not keep the seeded
passwords. This is inherent to shipping a demo-seeded codebase; the credentials
are already openly documented in README/TESTING. Recommended (optional) follow-up:
add a "never run `db:seed` in production without rotating every password" warning
to the README's seed section.

## If scrubbing were ever required
`seed-credentials.json` sits in the root commit, so removal means history rewrite
(`git filter-repo`) + force-push + collaborator re-clones — only worth it if the
demo password were ever used on a real deployment.
