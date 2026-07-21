#!/usr/bin/env node
/**
 * Clinic Rooms — setup wizard.
 *
 * The Windows console cannot render Hebrew properly (missing glyphs / reversed
 * letters), so the wizard opens a full Hebrew guide in the browser
 * (setup/guide.html) and keeps the console output to short, simple English.
 * Step numbers printed here match the numbered sections in the guide.
 *
 * Run: npm run setup   (or double-click install.bat)
 * Progress is saved in setup/.setup-state.json — safe to stop and re-run.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = path.join(ROOT, "setup", ".setup-state.json");
const ENV_FILE = path.join(ROOT, ".env.local");
const SUMMARY_FILE = path.join(ROOT, "SETUP_SUMMARY.txt");
const GUIDE_FILE = path.join(ROOT, "setup", "guide.html");

// the wizard needs a reasonably modern Node — check before anything else
const NODE_MAJOR = Number(process.version.slice(1).split(".")[0]);
if (NODE_MAJOR < 20) {
  console.error(`  [!] Node.js ${process.version} is too old - version 20+ is required.`);
  console.error("      Install the LTS version from https://nodejs.org and run again.");
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });

// ---------- console helpers ----------
const line = (s = "") => console.log(s);
const title = (s) => {
  line("");
  line("=".repeat(58));
  line("  " + s);
  line("=".repeat(58));
};
const ok = (s) => line("  [OK] " + s);
const warn = (s) => line("  [!] " + s);
const info = (s) => line("  " + s);
const guideRef = (section) => info(`>>> Hebrew instructions: browser guide, section ${section}`);

async function ask(q, { def = "", required = true, validate } = {}) {
  for (;;) {
    const suffix = def ? ` [${def}]` : "";
    const answer = (await rl.question(`  ${q}${suffix}: `)).trim() || def;
    if (!answer && required) {
      warn("A value is required here.");
      continue;
    }
    if (answer && validate) {
      const err = validate(answer);
      if (err) {
        warn(err);
        continue;
      }
    }
    return answer;
  }
}

async function askYesNo(q, def = true) {
  const hint = def ? "Y/n" : "y/N";
  const a = (await rl.question(`  ${q} (${hint}): `)).trim().toLowerCase();
  if (!a) return def;
  return ["y", "yes", "1"].includes(a);
}

async function pause(msg = "Press Enter to continue...") {
  await rl.question(`  ${msg}`);
}

// hidden input (password) — echoes * instead of the typed characters
function askHidden(q) {
  return new Promise((resolve) => {
    stdout.write(`  ${q}: `);
    const chars = [];
    const onData = (buf) => {
      const c = buf.toString("utf8");
      if (c === "\r" || c === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(chars.join(""));
      } else if (c === "") {
        // Ctrl+C
        stdin.setRawMode(false);
        process.exit(1);
      } else if (c === "" || c === "") {
        // Backspace / Delete
        if (chars.length > 0) {
          chars.pop();
          stdout.write("\b \b");
        }
      } else {
        chars.push(c);
        stdout.write("*");
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// ---------- process helpers ----------
function run(cmd, args, { input, env, cwd = ROOT, inherit = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    shell: true, // Windows: resolves npm/npx/gh .cmd shims
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

function has(cmd) {
  return run(cmd, ["--version"]).ok;
}

// interactive command (login flows need the terminal)
function runInteractive(cmd, args, env = {}) {
  return run(cmd, args, { inherit: true, env }).ok;
}

function openGuide() {
  const p = GUIDE_FILE;
  if (process.platform === "win32") run("cmd", ["/c", "start", '""', `"${p}"`]);
  else if (process.platform === "darwin") run("open", [`"${p}"`]);
  else run("xdg-open", [`"${p}"`]);
}

// ---------- state & env ----------
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { done: {} };
  }
}
function saveState(state) {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadEnv() {
  const map = {};
  if (existsSync(ENV_FILE)) {
    for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(raw);
      if (m) map[m[1]] = m[2];
    }
  }
  return map;
}
function saveEnv(map) {
  const order = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "CRON_SECRET",
    "ANTHROPIC_API_KEY",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "GITHUB_BACKUP_TOKEN",
    "GITHUB_BACKUP_REPO",
  ];
  const keys = [...new Set([...order.filter((k) => k in map), ...Object.keys(map)])];
  writeFileSync(ENV_FILE, keys.map((k) => `${k}=${map[k]}`).join("\n") + "\n");
}

const secret = () => randomBytes(32).toString("base64url");

// ---------- steps ----------

async function stepWelcome() {
  title("Clinic Rooms - Setup Wizard");
  info("A full Hebrew guide just opened in your browser - keep it open!");
  info("If it did not open, open this file yourself:");
  info(`  ${GUIDE_FILE}`);
  line("");
  info("This console only shows short prompts in English.");
  info("Each STEP number here matches a numbered section in the guide.");
  line("");
  await pause();
}

async function stepDisclaimer(state) {
  if (state.done.disclaimer) return;
  title("STEP 1: Terms of use");
  guideRef("1");
  info("Please read the terms in the browser guide (built by volunteers,");
  info("AI-assisted, provided AS-IS, no warranty, use at your own risk).");
  line("");
  for (;;) {
    const a = (await rl.question('  Type "agree" to accept and continue: ')).trim().toLowerCase();
    if (["agree", "מסכים", "מסכימה"].includes(a)) break;
    warn('To continue you must type: agree');
  }
  ok("Thank you! Continuing.");
  state.done.disclaimer = true;
  saveState(state);
}

async function stepNpmInstall(state) {
  if (state.done.npmInstall && existsSync(path.join(ROOT, "node_modules"))) return;
  title("STEP 2: Installing packages (automatic)");
  guideRef("2");
  info("Running npm install - this can take a few minutes...");
  const res = run("npm", ["install", "--no-audit", "--no-fund"], { inherit: true });
  if (!res.ok) throw new Error("npm install failed - check your internet connection and run again.");
  ok("Packages installed.");
  state.done.npmInstall = true;
  saveState(state);
}

async function stepNeon(state, env) {
  if (env.DATABASE_URL && state.done.neon) return;
  title("STEP 3: Database (Neon)");
  guideRef("3");
  info("Create a free database at https://neon.tech and copy the");
  info("'Pooled connection' string (starts with postgresql://).");
  line("");
  const url = await ask("Paste your connection string here", {
    validate: (v) =>
      /^postgres(ql)?:\/\/.+@.+\//.test(v) ? null : "That does not look like a Neon connection string (postgresql://...)",
  });
  env.DATABASE_URL = url;
  saveEnv(env);

  info("Testing the connection...");
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    await sql`select 1`;
    ok("Database connection works!");
  } catch (e) {
    warn("Connection failed: " + (e?.message ?? e));
    warn("Copy the FULL connection string (including the password) and run again.");
    throw new Error("Database connection failed");
  }
  state.done.neon = true;
  saveState(state);
}

async function stepSecrets(state, env) {
  if (env.BETTER_AUTH_SECRET && env.CRON_SECRET) return;
  title("STEP 4: Security keys (automatic)");
  guideRef("4");
  env.BETTER_AUTH_SECRET ||= secret();
  env.CRON_SECRET ||= secret();
  env.BETTER_AUTH_URL ||= "http://localhost:3000";
  saveEnv(env);
  ok("Security keys generated and saved.");
  state.done.secrets = true;
  saveState(state);
}

async function stepAi(state, env) {
  if (state.done.ai) return;
  title("STEP 5: AI assistant (optional)");
  guideRef("5");
  info("Optional Claude-powered features. The system works fine without it.");
  line("");
  if (await askYesNo("Set up an Anthropic API key now?", false)) {
    const key = await ask("Paste the API key (or Enter to skip)", {
      required: false,
      validate: (v) => (v.startsWith("sk-ant-") ? null : "An Anthropic key starts with sk-ant-"),
    });
    if (key) {
      env.ANTHROPIC_API_KEY = key;
      saveEnv(env);
      ok("Key saved.");
    }
  } else {
    info("Skipped - you can add it later (see guide, 'after installation').");
  }
  state.done.ai = true;
  saveState(state);
}

async function stepPush(state, env) {
  if (state.done.push) return;
  title("STEP 6: Phone notifications (optional)");
  guideRef("6");
  if (await askYesNo("Enable push notifications?", true)) {
    const email = await ask("Your email address", {
      validate: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "Invalid email address"),
    });
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
    env.VAPID_PRIVATE_KEY = keys.privateKey;
    env.VAPID_SUBJECT = `mailto:${email}`;
    saveEnv(env);
    ok("Notification keys generated.");
  } else {
    info("Skipped - can be enabled later.");
  }
  state.done.push = true;
  saveState(state);
}

async function stepDbPush(state) {
  if (state.done.dbPush) return;
  title("STEP 7: Creating database tables (automatic)");
  guideRef("7");
  const res = run("node", ["scripts/migrate.mjs"], { inherit: true });
  if (!res.ok) throw new Error("Creating tables failed - check the connection string and run again.");
  ok("Database tables created.");
  state.done.dbPush = true;
  saveState(state);
}

async function stepBootstrap(state) {
  if (state.done.bootstrap) return;
  title("STEP 8: Your admin account");
  guideRef("8");
  info("Choose a login username (lowercase english) and a password.");
  info("Your Hebrew display name + clinic name are set later, inside the app.");
  line("");
  const adminUsername = await ask("Username (lowercase english)", {
    validate: (v) => (/^[a-z0-9._-]{2,30}$/.test(v) ? null : "Lowercase english letters, digits, dot or dash only"),
  });
  let adminPassword = "";
  for (;;) {
    adminPassword = await askHidden("Choose a password (min 8 characters)");
    if (adminPassword.length < 8) {
      warn("Too short - at least 8 characters.");
      continue;
    }
    const again = await askHidden("Repeat the password");
    if (again !== adminPassword) {
      warn("Passwords do not match - try again.");
      continue;
    }
    break;
  }

  const res = run("npm", ["run", "db:bootstrap"], {
    env: {
      ADMIN_NAME: adminUsername, // renamed to a Hebrew display name in the in-app wizard
      ADMIN_USERNAME: adminUsername,
      ADMIN_PASSWORD: adminPassword,
    },
    inherit: true,
  });
  if (!res.ok) throw new Error("Creating the admin account failed.");
  ok(`Admin account created: ${adminUsername}`);
  warn("Remember your password - it is not stored anywhere!");
  state.done.bootstrap = true;
  state.adminUsername = adminUsername;
  saveState(state);
}

async function stepLocalTest(state) {
  if (state.done.localTest) return;
  title("STEP 9: Local test");
  guideRef("9");
  info("1. A local server will start now.");
  info("2. Open your browser at:  http://localhost:3000");
  info(`3. Log in as "${state.adminUsername ?? "your username"}" with your password.`);
  info("4. A short Hebrew setup wizard opens inside the app (name, days, hours...).");
  info("5. When done - come back here and press Ctrl+C to stop the server.");
  line("");
  if (await askYesNo("Start the local server now?", true)) {
    run("npm", ["run", "dev"], { inherit: true });
    line("");
    ok("Local server stopped.");
  }
  const good = await askYesNo("Did the login work and everything looked OK?", true);
  if (!good) {
    warn("See the troubleshooting section in the browser guide, then run again.");
    throw new Error("Local test not confirmed");
  }
  state.done.localTest = true;
  saveState(state);
}

async function stepGit(state) {
  if (state.done.git) return;
  title("STEP 10a: Preparing Git");
  if (!has("git")) {
    warn("Git is not installed on this computer.");
    info("Install it from: https://git-scm.com/download/win (defaults are fine),");
    info("close this window, and run install.bat again.");
    throw new Error("Git is missing");
  }
  if (!existsSync(path.join(ROOT, ".git"))) {
    run("git", ["init", "-b", "main"]);
    // a git identity is required for committing — set a local placeholder if missing
    if (!run("git", ["config", "user.email"]).stdout.trim()) {
      run("git", ["config", "user.name", '"Clinic Rooms"']);
      run("git", ["config", "user.email", "clinic-rooms@local"]);
    }
  }
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", '"Initial clinic-rooms install"']);
  ok("Local git repository ready.");
  state.done.git = true;
  saveState(state);
}

async function stepGithub(state) {
  if (state.done.github) return;
  title("STEP 10: Uploading the code to GitHub");
  guideRef("10");
  const repoName = await ask("Repository name", {
    def: "clinic-rooms",
    validate: (v) => (/^[A-Za-z0-9._-]+$/.test(v) ? null : "English letters, digits, dot or dash only"),
  });
  state.repoName = repoName;

  if (has("gh")) {
    info("GitHub CLI found - using it (easiest).");
    if (!run("gh", ["auth", "status"]).ok) {
      info("A GitHub login will open in your browser - follow the instructions:");
      if (!runInteractive("gh", ["auth", "login", "--web", "-g", "-p", "https"])) {
        throw new Error("GitHub login failed - run again.");
      }
    }
    const created = run("gh", ["repo", "create", repoName, "--private", "--source", ".", "--push"]);
    if (!created.ok && !/already exists/i.test(created.stderr)) {
      warn(created.stderr.trim());
      const pushed = run("git", ["push", "-u", "origin", "main"]);
      if (!pushed.ok) throw new Error("Creating or pushing the repository failed.");
    } else if (!created.ok) {
      run("git", ["push", "-u", "origin", "main"]);
    }
    ok(`Code uploaded to private repository: ${repoName}`);
  } else {
    info("GitHub CLI not found - manual mode (see guide, section 10):");
    info(`Create a PRIVATE, completely empty repository named: ${repoName}`);
    line("");
    const ghUser = await ask("Your GitHub username");
    run("git", ["remote", "remove", "origin"]);
    run("git", ["remote", "add", "origin", `https://github.com/${ghUser}/${repoName}.git`]);
    info("Pushing the code - a GitHub login window may open in your browser:");
    if (!runInteractive("git", ["push", "-u", "origin", "main"])) {
      throw new Error("Push to GitHub failed - check the username and run again.");
    }
    state.ghUser = ghUser;
    ok("Code uploaded to GitHub.");
  }
  state.done.github = true;
  saveState(state);
}

function vercelEnvAdd(name, value, targets = ["production", "preview", "development"]) {
  for (const target of targets) {
    run("npx", ["vercel", "env", "rm", name, target, "--yes"]);
    const res = run("npx", ["vercel", "env", "add", name, target], { input: value });
    if (!res.ok) return false;
  }
  return true;
}

async function stepVercel(state, env) {
  if (state.done.vercel) return;
  title("STEP 11: Deploying to the internet (Vercel)");
  guideRef("11");
  info("If you don't have a Vercel account yet: sign up at vercel.com/signup");
  info('using "Continue with GitHub" (important!). Then continue here.');
  line("");
  await pause();

  if (!run("npx", ["vercel", "whoami"]).ok) {
    info("Logging in to Vercel (follow the browser instructions):");
    if (!runInteractive("npx", ["vercel", "login"])) throw new Error("Vercel login failed.");
  }
  info("Creating/linking the Vercel project...");
  if (!run("npx", ["vercel", "link", "--yes"]).ok) throw new Error("Project link failed.");

  info("Connecting the GitHub repository (for automatic updates)...");
  const gitConnect = run("npx", ["vercel", "git", "connect", "--yes"]);
  if (!gitConnect.ok) {
    warn("Automatic GitHub connection failed - you can connect manually later:");
    info("Vercel dashboard: Project > Settings > Git > Connect Git Repository");
    info("(The first deployment works without it - continuing.)");
  }

  info("Uploading environment settings to Vercel...");
  const pairs = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET],
    ["CRON_SECRET", env.CRON_SECRET],
    ["ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY],
    ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY],
    ["VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY],
    ["VAPID_SUBJECT", env.VAPID_SUBJECT],
  ].filter(([, v]) => v);
  for (const [k, v] of pairs) {
    if (!vercelEnvAdd(k, v)) warn(`Could not set ${k} - you can add it manually in the dashboard.`);
  }

  info("Deploying for the first time (takes 2-3 minutes)...");
  const deploy = run("npx", ["vercel", "--prod"]);
  const url = (deploy.stdout + deploy.stderr).match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
  if (!deploy.ok || !url) {
    warn(deploy.stderr.slice(-800));
    throw new Error("Deployment failed - run the wizard again, or deploy from the Vercel dashboard.");
  }
  ok(`Your system is live: ${url}`);

  // BETTER_AUTH_URL must point at the public address — update and redeploy
  info("Updating the login address and redeploying...");
  vercelEnvAdd("BETTER_AUTH_URL", url, ["production"]);
  const redeploy = run("npx", ["vercel", "--prod"]);
  const finalUrl = (redeploy.stdout + redeploy.stderr).match(/https:\/\/[^\s]+\.vercel\.app/)?.[0] ?? url;
  ok(`Deployment complete: ${finalUrl}`);

  state.prodUrl = finalUrl;
  state.done.vercel = true;
  saveState(state);
}

async function stepBackup(state, env) {
  if (state.done.backup) return;
  title("STEP 12: Daily automatic backup (optional, recommended)");
  guideRef("12");
  if (!(await askYesNo("Set up a nightly backup to GitHub?", true))) {
    info("Skipped - can be set up later (see guide).");
    state.done.backup = true;
    saveState(state);
    return;
  }

  const backupRepo = `${state.repoName ?? "clinic-rooms"}-backups`;
  let ghUser = state.ghUser ?? "";
  if (has("gh")) {
    run("gh", ["repo", "create", backupRepo, "--private"]);
    ghUser ||= run("gh", ["api", "user", "-q", ".login"]).stdout.trim();
    ok(`Private backup repository created: ${backupRepo}`);
  } else {
    info(`Create a new PRIVATE empty repository on GitHub named: ${backupRepo}`);
    await pause("Press Enter when done...");
    ghUser ||= await ask("Your GitHub username");
  }

  info("Now create a fine-grained access token (see guide, section 12).");
  line("");
  const token = await ask("Paste the token (or Enter to skip)", { required: false });
  if (token) {
    env.GITHUB_BACKUP_TOKEN = token;
    env.GITHUB_BACKUP_REPO = `${ghUser}/${backupRepo}`;
    saveEnv(env);
    vercelEnvAdd("GITHUB_BACKUP_TOKEN", token, ["production"]);
    vercelEnvAdd("GITHUB_BACKUP_REPO", `${ghUser}/${backupRepo}`, ["production"]);
    run("npx", ["vercel", "--prod"]);
    ok("Daily backup configured (runs every night at 01:30 UTC).");
  } else {
    info("Backup skipped.");
  }
  state.done.backup = true;
  saveState(state);
}

function writeSummary(state, env) {
  const lines = [
    "==============================================",
    "  מערכת ניהול חדרי טיפול — סיכום התקנה",
    "==============================================",
    "",
    `כתובת המערכת:   ${state.prodUrl ?? "(טרם נפרס)"}`,
    `שם משתמש ניהול: ${state.adminUsername ?? ""}`,
    "סיסמה:          (מה שבחרתם — לא נשמרה בקובץ)",
    "",
    "מה עכשיו?",
    "  1. היכנסו לכתובת המערכת והתחברו.",
    "  2. אם עוד לא עברתם — יופיע אשף הגדרה קצר בעברית: שם המרפאה, ימים,",
    "     שעות, חדרים וצוות (וגם השם העברי שלכם).",
    "  3. מסרו לכל איש צוות את שם המשתמש והסיסמה הזמנית שלו.",
    "  4. מדריכים מלאים: docs/ADMIN_GUIDE.md (לניהול) ו-docs/STAFF_GUIDE.md (לצוות).",
    "",
    "תוספות שאפשר להגדיר בעתיד (הסבר במדריך הדפדפן, setup/guide.html):",
    `  - עוזר חכם (Claude): ${env.ANTHROPIC_API_KEY ? "מוגדר" : "לא מוגדר"}`,
    `  - התראות דחיפה:      ${env.VAPID_PRIVATE_KEY ? "מוגדר" : "לא מוגדר"}`,
    `  - גיבוי יומי:        ${env.GITHUB_BACKUP_REPO ? `מוגדר (${env.GITHUB_BACKUP_REPO})` : "לא מוגדר"}`,
    "",
    "שמרו את הקובץ הזה במקום בטוח.",
    "",
  ];
  writeFileSync(SUMMARY_FILE, "﻿" + lines.join("\r\n"));
}

// ---------- main ----------
async function main() {
  const state = loadState();
  const env = loadEnv();

  openGuide();
  await stepWelcome();
  await stepDisclaimer(state);
  await stepNpmInstall(state);
  await stepNeon(state, env);
  await stepSecrets(state, env);
  await stepAi(state, env);
  await stepPush(state, env);
  await stepDbPush(state);
  await stepBootstrap(state);
  await stepLocalTest(state);

  title("Going online");
  info("The system works locally - now let's put it on the internet");
  info("so your team can use it from anywhere.");
  line("");
  if (await askYesNo("Continue to the online deployment?", true)) {
    await stepGit(state);
    await stepGithub(state);
    await stepVercel(state, env);
    await stepBackup(state, env);
  } else {
    info("You can run the wizard again anytime to finish the deployment.");
  }

  writeSummary(state, env);
  title("Done!");
  if (state.prodUrl) info(`Your system: ${state.prodUrl}`);
  info("A Hebrew summary was saved to: SETUP_SUMMARY.txt");
  info("User guides (Hebrew): docs/ADMIN_GUIDE.md, docs/STAFF_GUIDE.md");
  line("");
  rl.close();
}

main().catch((e) => {
  line("");
  warn("The wizard stopped: " + (e?.message ?? e));
  info("Progress was saved - run install.bat (or: npm run setup) to continue.");
  rl.close();
  process.exit(1);
});
