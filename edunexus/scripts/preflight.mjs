/**
 * Smoke-test preflight — verifies both backends are up before running the
 * smoke suites. Exits 1 with a clear message naming the down backend.
 *
 * Usage: node scripts/preflight.mjs
 *   NEXT_URL env overrides the Next server   (default http://localhost:57362)
 *   API_URL  env overrides the Laravel API   (default http://127.0.0.1:8000/api/v1)
 */
const NEXT = process.env.NEXT_URL ?? "http://localhost:57362";
const API = process.env.API_URL ?? "http://127.0.0.1:8000/api/v1";

async function probe(url, name, expect) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      console.log(`  ✓ ${name} (${url}) → ${res.status}`);
      return true;
    }
    console.error(`  ✗ ${name} (${url}) responded ${res.status}${expect ? `, expected ${expect}` : ""}`);
    return false;
  } catch (err) {
    const reason = err?.cause?.code ?? err?.name ?? "unknown error";
    console.error(`  ✗ ${name} (${url}) is unreachable — ${reason}`);
    return false;
  }
}

console.log("Preflight — checking both backends");
const nextOk = await probe(`${NEXT}/login`, "Next.js server", 200);
const apiOk = await probe(`${API}/public/settings`, "Laravel API", 200);

if (!nextOk) {
  console.error("\nNext server is DOWN. Start it with:  cd edunexus && npm run start");
  console.error("(production build required first: npm run build; do NOT use `next dev` for smoke tests)");
}
if (!apiOk) {
  console.error("\nLaravel API is DOWN. Start it with:  cd edunexus/api && php artisan serve");
}

if (nextOk && apiOk) {
  console.log("\nBoth backends up — safe to run the smoke suites.");
  process.exit(0);
}
console.error(`\nPreflight FAILED — ${!nextOk ? "Next" : ""}${!nextOk && !apiOk ? " and " : ""}${!apiOk ? "Laravel" : ""} unavailable. Smoke tests not run.`);
process.exit(1);
