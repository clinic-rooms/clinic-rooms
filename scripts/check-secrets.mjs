/**
 * Secret scanner — fails if anything that looks like a real credential is
 * committed to the repo. Runs in CI (.github/workflows/checks.yml) and can be
 * run locally: node scripts/check-secrets.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "drizzle"]);
const SKIP_FILES = [/^\.env/, /^SETUP_SUMMARY/, /package-lock\.json$/];
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|html|css|txt|sh|bat)$/;

const PATTERNS = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Postgres URL with password", re: /postgres(?:ql)?:\/\/[A-Za-z0-9_.-]+:[^@\s"'`]{4,}@/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Vercel token", re: /\bvercel_[A-Za-z0-9]{24,}\b/ },
];

const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full);
      continue;
    }
    if (SKIP_FILES.some((re) => re.test(entry)) || !TEXT_EXT.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    for (const { name, re } of PATTERNS) {
      const m = re.exec(text);
      if (m) {
        const line = text.slice(0, m.index).split("\n").length;
        hits.push(`${rel}:${line} — ${name}`);
      }
    }
  }
}

walk(ROOT);

if (hits.length > 0) {
  console.error("[secrets] Possible credentials found — DO NOT COMMIT:");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log("[secrets] Clean — no credentials detected.");
