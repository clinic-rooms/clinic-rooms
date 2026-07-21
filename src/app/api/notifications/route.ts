import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ unread: 0, items: [] }, { status: 401 });

  // one query — polled every 60s by every client, keep it cheap
  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  return NextResponse.json({
    unread: items.filter((i) => !i.isRead).length,
    items,
  });
}
