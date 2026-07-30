// One-time migration: merge per-day / duplicate full-day absences into ranges.
// Usage: node scripts/merge-vacations.mjs [--apply]
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "fs";
const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\r\n]+)/)[1];
const sql = neon(url);
const APPLY = process.argv.includes("--apply");

const settings = await sql`SELECT active_days FROM clinic_settings LIMIT 1`;
const activeDays = settings[0]?.active_days ?? [0, 1, 2, 3, 4];

const rows = await sql`
  SELECT a.id, a.user_id, a.date_from::text AS date_from, a.date_to::text AS date_to, a.note, a.created_by, u.name
  FROM one_time_absences a JOIN "user" u ON u.id = a.user_id
  WHERE a.start_min IS NULL
  ORDER BY a.user_id, a.date_from`;

// full backup before touching anything
writeFileSync("scripts/absences-backup.json", JSON.stringify(rows, null, 1));
console.log(`backup: ${rows.length} full-day rows -> scripts/absences-backup.json`);

const addDays = (d, n) => {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
const dowOf = (d) => new Date(d + "T12:00:00").getDay();
// touch = overlap, or a gap consisting only of non-working days (Fri/Sat)
function touches(aTo, bFrom) {
  if (bFrom <= aTo) return true;
  let d = addDays(aTo, 1);
  let guard = 0;
  while (d < bFrom && guard++ < 10) {
    if (activeDays.includes(dowOf(d))) return false;
    d = addDays(d, 1);
  }
  return true;
}

const byUser = new Map();
for (const r of rows) {
  if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
  byUser.get(r.user_id).push(r);
}

const plans = [];
for (const [, list] of byUser) {
  let group = [list[0]];
  const flush = () => {
    if (group.length > 1) plans.push(group);
    group = [];
  };
  for (let i = 1; i < list.length; i++) {
    const last = group[group.length - 1];
    const maxTo = group.reduce((m, g) => (g.date_to > m ? g.date_to : m), group[0].date_to);
    if (touches(maxTo, list[i].date_from)) group.push(list[i]);
    else {
      flush();
      group = [list[i]];
    }
    void last;
  }
  flush();
}

if (plans.length === 0) {
  console.log("nothing to merge — all full-day absences are already distinct ranges");
  process.exit(0);
}

for (const group of plans) {
  const from = group.reduce((m, g) => (g.date_from < m ? g.date_from : m), group[0].date_from);
  const to = group.reduce((m, g) => (g.date_to > m ? g.date_to : m), group[0].date_to);
  const notes = [...new Set(group.map((g) => g.note?.trim()).filter(Boolean))].join(" · ").slice(0, 200) || null;
  const createdBy = group.some((g) => g.created_by === "self") ? "self" : "admin";
  console.log(`\n${group[0].name}: ${group.length} rows -> ${from} .. ${to}${notes ? ` (${notes})` : ""}`);
  for (const g of group) console.log(`   - ${g.date_from} .. ${g.date_to} [${g.created_by}]${g.note ? ` "${g.note}"` : ""}`);
  if (APPLY) {
    const keep = group[0];
    await sql`UPDATE one_time_absences SET date_from = ${from}, date_to = ${to}, note = ${notes}, created_by = ${createdBy} WHERE id = ${keep.id}`;
    for (const g of group.slice(1)) await sql`DELETE FROM one_time_absences WHERE id = ${g.id}`;
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN (no changes)"} — ${plans.length} merge group(s)`);
