import { NextRequest, NextResponse } from "next/server";
import { exportAll } from "@/lib/backup";

export const maxDuration = 60;

/**
 * Daily backup (Vercel Cron): dumps every table to JSON and commits it to a
 * private GitHub repo. Each backup is a dated commit — full history forever.
 * Guarded by CRON_SECRET (Vercel sends it as Authorization: Bearer <secret>).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo = process.env.GITHUB_BACKUP_REPO; // "owner/repo"
  if (!token || !repo) {
    return NextResponse.json({ ok: false, error: "GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO not set" }, { status: 500 });
  }

  const backup = await exportAll(new Date().toISOString());

  const date = new Date().toISOString().slice(0, 10);
  const path = `backups/${date}.json`;
  const content = Buffer.from(JSON.stringify(backup, null, 1)).toString("base64");

  const gh = (url: string, init?: RequestInit) =>
    fetch(`https://api.github.com${url}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers,
      },
    });

  // need existing file SHA to overwrite same-day backups
  let sha: string | undefined;
  const existing = await gh(`/repos/${repo}/contents/${path}`);
  if (existing.ok) sha = (await existing.json()).sha;

  const put = await gh(`/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `backup ${backup.createdAt}`,
      content,
      sha,
    }),
  });

  if (!put.ok) {
    const err = await put.text();
    console.error("backup failed:", err);
    return NextResponse.json({ ok: false, error: `GitHub API: ${put.status}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    path,
    rows: Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length])),
  });
}
