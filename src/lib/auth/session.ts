import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Current session or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Require a logged-in, active, non-banned user; redirects to /login otherwise. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const u = session.user as typeof session.user & { banned?: boolean; isActive?: boolean };
  if (u.banned || u.isActive === false) redirect("/login");
  return session;
}

/** Require an admin; redirects non-admins to the user home. */
export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "admin") redirect("/");
  return session;
}
