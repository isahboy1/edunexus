/**
 * CI workflow dry-run — validates .github/workflows/smoke.yml locally so the
 * first real push is likely green. No containers required.
 *
 * Checks:
 *   1. The workflow YAML parses and has the expected structure.
 *   2. Every `run:` block is valid bash (bash -n).
 *   3. Every CI env var is actually consumed by the code it targets
 *      (catches renamed/typo'd variables that silently no-op in CI).
 *
 * Run: node scripts/ci-dry-run.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = join(root, ".github", "workflows", "smoke.yml");

let failures = 0;
function ok(name) {
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}
function check(name, cond, detail) {
  cond ? ok(name) : bad(name, detail);
}

// 1. Parse + structure ────────────────────────────────────────────
console.log("[1] Workflow parses");
let wf;
try {
  wf = yaml.load(readFileSync(workflowPath, "utf8"));
  ok(`YAML parses (${workflowPath})`);
} catch (err) {
  bad("YAML parses", err.message);
  process.exit(1);
}
check("'on' triggers push", wf.on && ("push" in wf.on), JSON.stringify(wf.on ?? null));
const job = wf.jobs?.smoke;
check("job 'smoke' exists", Boolean(job));
check("runs-on ubuntu-latest", job?.["runs-on"] === "ubuntu-latest");
check("postgres service defined", Boolean(job?.services?.postgres), "services missing");
check(
  "service is postgres:17 with a health check",
  String(job?.services?.postgres?.image ?? "").includes("postgres:17") &&
    Boolean(job?.services?.postgres?.options?.includes("pg_isready"))
);
const steps = job?.steps ?? [];
check(`job has steps (${steps.length})`, steps.length >= 10);

// 2. bash -n every run block ─────────────────────────────────────
console.log("[2] Shell blocks are valid bash");
const runSteps = steps.filter((s) => typeof s.run === "string");
check("has run steps", runSteps.length > 0);
for (const step of runSteps) {
  const name = step.name ?? step.run.slice(0, 40);
  try {
    execFileSync("bash", ["-n"], { input: step.run, stdio: ["pipe", "ignore", "pipe"] });
    ok(`bash -n ok: ${name}`);
  } catch (err) {
    bad(`bash -n ok: ${name}`, String(err.stderr ?? err.message).slice(0, 300));
  }
}

// 3. CI env vars are consumed where they are needed ──────────────
console.log("[3] CI env vars are consumed");
const ciEnv = job.env ?? {};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

// Next side ( DATABASE_URL must reach lib/db + prisma.config.ts; AUTH_SECRET the auth lib )
const nextEnv = [read(join(root, "edunexus", ".env.example")), read(join(root, "edunexus", "src", "lib", "db.ts"))].join("\n");
check("DATABASE_URL is the documented Next var", nextEnv.includes("DATABASE_URL"));
const authReads = read(join(root, "edunexus", "src", "lib", "auth.ts"));
check("AUTH_SECRET is read by src/lib/auth.ts", /process\.env\.AUTH_SECRET/.test(authReads));

// Smoke suites: NEXT_URL / API_URL defaults + env overrides
const smoke = read(join(root, "edunexus", "scripts", "smoke.mjs"));
const preflight = read(join(root, "edunexus", "scripts", "preflight.mjs"));
const testimonials = read(join(root, "edunexus", "scripts", "smoke-testimonials.mjs"));
const lecturer = read(join(root, "edunexus", "scripts", "smoke-lecturer.mjs"));
check("NEXT_URL overrides exist in smoke suites/preflight", [smoke, preflight, testimonials, lecturer].every((s) => s.includes("NEXT_URL")));
check("API_URL override exists in preflight", preflight.includes("API_URL"));
check(
  "suite defaults match the ports CI starts (:57362 Next, :8000 Laravel)",
  smoke.includes("57362") && smoke.includes("127.0.0.1:8000") && testimonials.includes("57362")
);

// Laravel side: the heredoc .env must satisfy the vars config/*.php reads,
// and every config file referenced by the code must have a CI value or ship a default.
const apiDir = join(root, "edunexus", "api");
const heredocStep = runSteps.find((s) => (s.name ?? "").includes("Install Laravel"));
check("Laravel install step writes a .env", Boolean(heredocStep));
const ciEnvKeys = Object.keys(ciEnv);
for (const cfg of readdirSync(join(apiDir, "config")).filter((f) => f.endsWith(".php"))) {
  const src = read(join(apiDir, "config", cfg));
  const keys = [...src.matchAll(/env\(\s*['"]([A-Z0-9_]+)['"]/g)].map((m) => m[1]);
  for (const key of keys) {
    // Stock Laravel keys whose env() lookups only matter for drivers CI does
    // not select (pgsql DB, array cache/session/queue, log mailer, mock
    // gateway). A null there is harmless; custom app keys are NOT exempt.
    const stockOptional = new Set([
      "APP_KEY", "APP_ENV", "APP_NAME", "APP_URL", "APP_DEBUG", "APP_LOCALE", "APP_FALLBACK_LOCALE", "APP_FAKER_LOCALE", "APP_MAINTENANCE_DRIVER", "LOG_LEVEL", "LOG_CHANNEL", "LOG_STACK", "LOG_DEPRECATIONS_CHANNEL", "BCRYPT_ROUNDS", "VITE_APP_NAME", "OCTANE_SERVER",
      "DB_URL", "MYSQL_ATTR_SSL_CA", "REDIS_URL", "DB_QUEUE_CONNECTION", "SQS_SUFFIX",
      "MEMCACHED_USERNAME", "MEMCACHED_PASSWORD", "MEMCACHED_PERSISTENT_ID", "REDIS_USERNAME", "REDIS_PASSWORD",
      "DB_CACHE_CONNECTION", "DB_CACHE_LOCK_CONNECTION", "DB_CACHE_LOCK_TABLE", "CACHE_STORAGE_DISK", "DYNAMODB_ENDPOINT",
      "SESSION_CONNECTION", "SESSION_STORE", "SESSION_DOMAIN", "SESSION_SECURE_COOKIE",
      "MAIL_FROM_ADDRESS", "MAIL_FROM_NAME", "MAIL_SCHEME", "MAIL_URL", "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_LOG_CHANNEL", "POSTMARK_MESSAGE_STREAM_ID",
      "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION", "AWS_BUCKET", "AWS_ENDPOINT", "AWS_URL", "AWS_USE_PATH_STYLE_ENDPOINT",
      "LOG_SLACK_WEBHOOK_URL", "PAPERTRAIL_URL", "PAPERTRAIL_PORT", "LOG_STDERR_FORMATTER",
    ]);
    if (stockOptional.has(key)) continue;
    // Live-gateway credential slots are null by design; they only matter when
    // CI actually selects PAYMENT_GATEWAY=remita.
    if (key.startsWith("REMITA_") && !/PAYMENT_GATEWAY\s*=\s*remita/.test(heredocStep?.run ?? "")) continue;
    const inHeredoc = heredocStep?.run?.includes(key) ?? false;
    const inJobEnv = ciEnvKeys.includes(key);
    const cfgFile = read(join(apiDir, "config", cfg));
    const hasDefault = new RegExp(`env\\(\\s*['"]${key}['"]\\s*,\\s*[^)]+\\)`).test(cfgFile);
    if (!inHeredoc && !inJobEnv && !hasDefault) {
      bad(`config/${cfg} needs ${key}`, "not in CI heredoc .env, job env, or given a default");
    }
  }
}
ok("Laravel config env cross-check done");

// The smoke-assumed demo accounts must be produced by the seeds CI runs.
const creds = JSON.parse(readFileSync(join(root, "edunexus", "seed-credentials.json"), "utf8"));
const emails = creds.staff.map((s) => s.email);
check(
  "seed-credentials.json has the smoke-suite logins",
  emails.includes("admin@edunexus.edu.ng") && emails.includes("admissions@edunexus.edu.ng")
);

console.log(`\n  RESULT: ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
