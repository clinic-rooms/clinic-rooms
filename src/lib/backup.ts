import "server-only";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";

export type BackupFile = {
  version: number;
  createdAt: string;
  tables: Record<string, unknown[]>;
};

/** Full data export (everything except transient sessions). */
export async function exportAll(createdAt: string): Promise<BackupFile> {
  const [
    user,
    account,
    verification,
    clinicSettings,
    rooms,
    roomAvailability,
    fixedAssignments,
    recurringReductions,
    oneTimeAbsences,
    oneTimeBookings,
    manualLabels,
    clinicClosures,
    swapRequests,
    roomRequests,
    assignmentRequests,
    pushSubscriptions,
    notifications,
  ] = await Promise.all([
    db.select().from(t.user),
    db.select().from(t.account),
    db.select().from(t.verification),
    db.select().from(t.clinicSettings),
    db.select().from(t.rooms),
    db.select().from(t.roomAvailability),
    db.select().from(t.fixedAssignments),
    db.select().from(t.recurringReductions),
    db.select().from(t.oneTimeAbsences),
    db.select().from(t.oneTimeBookings),
    db.select().from(t.manualLabels),
    db.select().from(t.clinicClosures),
    db.select().from(t.swapRequests),
    db.select().from(t.roomRequests),
    db.select().from(t.assignmentRequests),
    db.select().from(t.pushSubscriptions),
    db.select().from(t.notifications),
  ]);

  return {
    version: 2,
    createdAt,
    tables: {
      user,
      account,
      verification,
      clinic_settings: clinicSettings,
      rooms,
      room_availability: roomAvailability,
      fixed_assignments: fixedAssignments,
      recurring_reductions: recurringReductions,
      one_time_absences: oneTimeAbsences,
      one_time_bookings: oneTimeBookings,
      manual_labels: manualLabels,
      clinic_closures: clinicClosures,
      swap_requests: swapRequests,
      room_requests: roomRequests,
      assignment_requests: assignmentRequests,
      push_subscriptions: pushSubscriptions,
      notifications,
    },
  };
}

// timestamp strings → Date; date-only strings ('2026-07-20') stay as strings
function fixDates(rows: unknown[]): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) out[k] = new Date(v);
    }
    return out;
  });
}

/** Wipe everything and re-insert from a backup (in FK-safe order). Destructive. */
export async function importAll(backup: BackupFile): Promise<void> {
  if (!backup || !backup.tables) throw new Error("backup format not recognized");
  const T = backup.tables;

  // wipe (children first)
  await db.delete(t.notifications);
  await db.delete(t.roomRequests);
  await db.delete(t.assignmentRequests);
  await db.delete(t.pushSubscriptions);
  await db.delete(t.swapRequests);
  await db.delete(t.oneTimeBookings);
  await db.delete(t.oneTimeAbsences);
  await db.delete(t.recurringReductions);
  await db.delete(t.fixedAssignments);
  await db.delete(t.manualLabels);
  await db.delete(t.roomAvailability);
  await db.delete(t.clinicClosures);
  await db.delete(t.rooms);
  await db.delete(t.clinicSettings);
  await db.delete(t.session);
  await db.delete(t.account);
  await db.delete(t.verification);
  await db.delete(t.user);

  const ins = async (table: unknown, rows?: unknown[]) => {
    if (rows && rows.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(table as any).values(fixDates(rows) as any);
    }
  };

  // insert (parents first)
  await ins(t.user, T.user);
  await ins(t.account, T.account);
  await ins(t.verification, T.verification);
  await ins(t.clinicSettings, T.clinic_settings);
  await ins(t.rooms, T.rooms);
  await ins(t.roomAvailability, T.room_availability);
  await ins(t.fixedAssignments, T.fixed_assignments);
  await ins(t.recurringReductions, T.recurring_reductions);
  await ins(t.oneTimeAbsences, T.one_time_absences);
  await ins(t.oneTimeBookings, T.one_time_bookings);
  await ins(t.manualLabels, T.manual_labels);
  await ins(t.clinicClosures, T.clinic_closures);
  await ins(t.swapRequests, T.swap_requests);
  await ins(t.roomRequests, T.room_requests);
  await ins(t.assignmentRequests, T.assignment_requests);
  await ins(t.pushSubscriptions, T.push_subscriptions);
  await ins(t.notifications, T.notifications);
}
