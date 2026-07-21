"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, CalendarClock, UserPlus, AlertTriangle, Scissors, Tag, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button, Label, Select, Avatar, Input } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { fmtMin, slotToMin, dowOf, DAY_NAMES, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe, todayIL } from "@/lib/dates";
import {
  adminCreateBooking,
  upsertAssignment,
  endAssignment,
  deleteAssignment,
  scheduleAssignmentMove,
  updateAssignmentHours,
  upsertLabel,
  deleteLabel,
} from "@/actions/admin-schedule";
import { createAbsence } from "@/actions/absences";
import { createReduction } from "@/actions/reductions";
import { cancelBooking } from "@/actions/bookings";
import type { GridRoom, GridUser, GridCell } from "@/components/admin-grid";

function hoursOf(bounds: SlotBounds): number[] {
  const out: number[] = [];
  for (let m = bounds.dayStartMin; m <= bounds.dayEndMin; m += SLOT_MIN) out.push(m);
  return out;
}

type RunFn = (fn: () => Promise<{ ok?: boolean; error?: string }>) => void;

export function GridCellSheet({
  date,
  room,
  slot,
  users,
  rooms,
  bounds,
  onClose,
}: {
  date: string;
  room: GridRoom;
  slot: number;
  users: GridUser[];
  rooms: GridRoom[];
  bounds: SlotBounds;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cell = room.cells[slot];
  const clickedMin = slotToMin(bounds, slot);
  const hours = hoursOf(bounds);

  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [startMin, setStartMin] = useState(clickedMin);
  const [endMin, setEndMin] = useState(Math.min(clickedMin + 60, bounds.dayEndMin));
  const [mode, setMode] = useState<"booking" | "fixed" | "label">("booking");

  // free-text label fields
  const [labelText, setLabelText] = useState("");
  const [labelRecurring, setLabelRecurring] = useState(false);

  const run: RunFn = (fn) => {
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("בוצע");
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="grid-scroll max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-bold">{room.name}</h3>
            <p className="text-sm text-muted-foreground">
              {fmtDateHe(date)} · {fmtMin(clickedMin)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        {cell.type === "occupied" && (
          <OccupiedView cell={cell} date={date} room={room} rooms={rooms} users={users} bounds={bounds} run={run} pending={pending} />
        )}

        {(cell.type === "free" || cell.type === "freed") && (
          <div className="space-y-3">
            {cell.type === "freed" && (
              <p className="rounded-xl bg-muted p-2 text-sm text-muted-foreground">
                {cell.inactive
                  ? `זה החדר הקבוע של ${cell.name}, שנמצא/ת כרגע בהשבתה (חופשה ארוכה) — החדר פנוי לשיבוץ עד לחזרתו/ה.`
                  : `החלון פונה על ידי ${cell.name} (היעדרות/צמצום) — אפשר לשבץ כאן.`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={mode === "booking" ? "primary" : "outline"} onClick={() => setMode("booking")}>
                שיבוץ חד־פעמי
              </Button>
              <Button size="sm" variant={mode === "fixed" ? "primary" : "outline"} onClick={() => setMode("fixed")}>
                שיבוץ קבוע ({DAY_NAMES[dowOf(date)]})
              </Button>
              <Button size="sm" variant={mode === "label" ? "primary" : "outline"} onClick={() => setMode("label")}>
                <Tag size={14} />
                טקסט חופשי
              </Button>
            </div>

            {mode === "label" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  כותרת של הניהול לרישום בחדר — מטפל זמני ללא חשבון, שם קבוצה וכו׳.
                  <b className="text-foreground"> החדר ייחשב תפוס בשעות אלה</b> ולא יוצע לאחרים.
                </p>
                <div>
                  <Label>טקסט</Label>
                  <Input value={labelText} onChange={(e) => setLabelText(e.target.value)} maxLength={60} placeholder="למשל: קבוצת הורים / אורח" />
                </div>
                <HoursPicker hours={hours} startMin={startMin} setStartMin={setStartMin} endMin={endMin} setEndMin={setEndMin} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={labelRecurring} onChange={(e) => setLabelRecurring(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  קבוע — כל יום {DAY_NAMES[dowOf(date)]}
                </label>
                <Button
                  className="w-full"
                  disabled={pending || labelText.trim().length < 1}
                  onClick={() =>
                    run(() =>
                      upsertLabel({
                        roomId: room.id,
                        text: labelText.trim(),
                        recurring: labelRecurring,
                        date: labelRecurring ? null : date,
                        dayOfWeek: labelRecurring ? dowOf(date) : null,
                        startMin,
                        endMin,
                        effectiveFrom: labelRecurring ? date : null,
                      })
                    )
                  }
                >
                  הוספת טקסט לחדר
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label>מטפל/ת</Label>
                  <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <HoursPicker hours={hours} startMin={startMin} setStartMin={setStartMin} endMin={endMin} setEndMin={setEndMin} />
                <Button
                  className="w-full"
                  disabled={pending || !userId}
                  onClick={() =>
                    run(() =>
                      mode === "booking"
                        ? adminCreateBooking({ userId, roomId: room.id, date, startMin, endMin, kind: "regular" })
                        : upsertAssignment({
                            userId,
                            roomId: room.id,
                            dayOfWeek: dowOf(date),
                            startMin,
                            endMin,
                            effectiveFrom: date,
                            kind: "regular",
                          })
                    )
                  }
                >
                  {mode === "booking" ? "שיבוץ ליום זה בלבד" : "קביעת שיבוץ שבועי קבוע"}
                </Button>
              </>
            )}
          </div>
        )}

        {cell.type === "closed" && <p className="text-sm text-muted-foreground">החדר אינו פעיל בשעה זו.</p>}
      </div>
    </div>
  );
}

function HoursPicker({
  hours,
  startMin,
  setStartMin,
  endMin,
  setEndMin,
}: {
  hours: number[];
  startMin: number;
  setStartMin: (v: number) => void;
  endMin: number;
  setEndMin: (v: number) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Label>משעה</Label>
        <Select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
          {hours.slice(0, -1).map((m) => (
            <option key={m} value={m}>
              {fmtMin(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex-1">
        <Label>עד שעה</Label>
        <Select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
          {hours.filter((m) => m > startMin).map((m) => (
            <option key={m} value={m}>
              {fmtMin(m)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function OccupiedView({
  cell,
  date,
  room,
  rooms,
  users,
  bounds,
  run,
  pending,
}: {
  cell: Extract<GridCell, { type: "occupied" }>;
  date: string;
  room: GridRoom;
  rooms: GridRoom[];
  users: GridUser[];
  bounds: SlotBounds;
  run: RunFn;
  pending: boolean;
}) {
  const clickedMin = slotToMin(bounds, room.cells.indexOf(cell));
  const hours = hoursOf(bounds);
  const [showMove, setShowMove] = useState(false);
  const [showPair, setShowPair] = useState(false);
  const [showVacate, setShowVacate] = useState(false);
  const [showEditHours, setShowEditHours] = useState(false);

  // direct edit of the assignment's own hours (defaults to its real range)
  const [editStart, setEditStart] = useState(cell.refStartMin ?? clickedMin);
  const [editEnd, setEditEnd] = useState(cell.refEndMin ?? Math.min(clickedMin + 60, bounds.dayEndMin));

  // scheduled move (room + day + hours)
  const [moveDate, setMoveDate] = useState(date);
  const [moveRoomId, setMoveRoomId] = useState(room.id);
  const [moveDow, setMoveDow] = useState(dowOf(date));
  const [moveStart, setMoveStart] = useState(clickedMin);
  const [moveEnd, setMoveEnd] = useState(Math.min(clickedMin + 60, bounds.dayEndMin));

  // double booking
  const [pairUserId, setPairUserId] = useState(
    users.find((u) => u.id !== cell.userId && u.id !== cell.second?.userId)?.id ?? ""
  );
  const [pairStart, setPairStart] = useState(clickedMin);
  const [pairEnd, setPairEnd] = useState(Math.min(clickedMin + 60, bounds.dayEndMin));

  // one-time partial vacate
  const [vacStart, setVacStart] = useState(clickedMin);
  const [vacEnd, setVacEnd] = useState(Math.min(clickedMin + 30, bounds.dayEndMin));
  const [vacRecurring, setVacRecurring] = useState(false);

  const isLabel = cell.source === "label";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {isLabel ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: cell.color }}>
            <Tag size={16} />
          </span>
        ) : (
          <Avatar name={cell.name} color={cell.color} size={32} />
        )}
        <div>
          <p className="font-medium">{cell.name}</p>
          <p className="text-xs text-muted-foreground">
            {isLabel ? "טקסט חופשי" : cell.source === "booking" ? "שיבוץ חד־פעמי" : "שיבוץ קבוע"}
            {cell.kind === "group" ? " · קבוצה" : ""}
          </p>
        </div>
      </div>

      {cell.second && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-2 dark:bg-amber-900/30">
          <Avatar name={cell.second.name} color={cell.second.color} size={26} />
          <div className="flex-1">
            <p className="text-sm font-medium">{cell.second.name}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">שיבוץ כפול באותו חדר</p>
          </div>
          {cell.second.source === "booking" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelBooking(cell.second!.refId))}>
              הסרה
            </Button>
          )}
        </div>
      )}

      {/* primary destructive action per source */}
      {isLabel ? (
        <Button variant="destructive" className="w-full" disabled={pending} onClick={() => run(() => deleteLabel(cell.refId))}>
          מחיקת הטקסט
        </Button>
      ) : cell.source === "booking" ? (
        <Button variant="destructive" className="w-full" disabled={pending} onClick={() => run(() => cancelBooking(cell.refId))}>
          ביטול השיבוץ החד־פעמי
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={() => run(() => endAssignment(cell.refId, date))}>
            סיום השיבוץ מהיום
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={pending}
            onClick={() => {
              if (confirm("למחוק את השיבוץ הקבוע לחלוטין (כולל היסטוריה)?")) run(() => deleteAssignment(cell.refId));
            }}
          >
            מחיקה מלאה
          </Button>
        </div>
      )}

      {/* partial vacate — free just some hours (one-time or recurring) of a fixed slot */}
      {cell.source === "fixed" && cell.kind !== "group" && (
        <div className="rounded-xl border border-primary/30 bg-accent/10 p-3">
          <button className="flex w-full items-center gap-1.5 text-sm font-medium" onClick={() => setShowVacate(!showVacate)}>
            <Scissors size={15} className="text-primary" />
            פינוי שעות מהחדר (שאר היום נשאר)
          </button>
          {showVacate && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant={!vacRecurring ? "primary" : "outline"} onClick={() => setVacRecurring(false)}>
                  ליום זה בלבד
                </Button>
                <Button size="sm" variant={vacRecurring ? "primary" : "outline"} onClick={() => setVacRecurring(true)}>
                  קבוע (כל {DAY_NAMES[dowOf(date)]})
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {vacRecurring
                  ? `החדר יתפנה בקביעות בכל יום ${DAY_NAMES[dowOf(date)]} בשעות שתבחרו (למשל קבוצה קבועה בחדר אחר) — שאר השיבוץ נשאר.`
                  : `רק החלון שתבחרו יתפנה בתאריך זה — שאר השיבוץ של ${cell.name} נשאר ללא שינוי.`}
              </p>
              <HoursPicker hours={hours} startMin={vacStart} setStartMin={setVacStart} endMin={vacEnd} setEndMin={setVacEnd} />
              <Button
                className="w-full"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    vacRecurring
                      ? createReduction({
                          userId: cell.userId,
                          dayOfWeek: dowOf(date),
                          startMin: vacStart,
                          endMin: vacEnd,
                          effectiveFrom: date,
                          note: "פונה על ידי הניהול",
                        })
                      : createAbsence({
                          userId: cell.userId,
                          dateFrom: date,
                          dateTo: date,
                          startMin: vacStart,
                          endMin: vacEnd,
                          note: "פונה על ידי הניהול",
                        })
                  )
                }
              >
                {vacRecurring ? "פינוי קבוע של השעות" : "פינוי השעות ליום זה"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* direct edit of the fixed assignment's hours (effective immediately) */}
      {cell.source === "fixed" && (
        <div className="rounded-xl border border-border p-3">
          <button className="flex w-full items-center gap-1.5 text-sm font-medium" onClick={() => setShowEditHours(!showEditHours)}>
            <Clock size={15} className="text-primary" />
            עריכת שעות השיבוץ הקבוע
          </button>
          {showEditHours && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                שינוי אורך היום הקבוע של {cell.name} (למשל לסיים חצי שעה מוקדם יותר). חל על כל השבועות.
              </p>
              <HoursPicker hours={hours} startMin={editStart} setStartMin={setEditStart} endMin={editEnd} setEndMin={setEditEnd} />
              <Button
                className="w-full"
                size="sm"
                disabled={pending}
                onClick={() => run(() => updateAssignmentHours(cell.refId, editStart, editEnd))}
              >
                שמירת השעות החדשות
              </Button>
            </div>
          )}
        </div>
      )}

      {/* scheduled future change — fixed assignments only */}
      {cell.source === "fixed" && (
        <div className="rounded-xl border border-border p-3">
          <button className="flex w-full items-center gap-1.5 text-sm font-medium" onClick={() => setShowMove(!showMove)}>
            <CalendarClock size={15} className="text-primary" />
            שינוי מתוזמן (חדר / יום / שעות)
          </button>
          {showMove && (
            <div className="mt-3 space-y-2">
              <div>
                <Label>החל מתאריך</Label>
                <DateField value={moveDate} min={todayIL()} onChange={setMoveDate} aria-label="החל מתאריך" />
              </div>
              <div>
                <Label>חדר</Label>
                <Select value={moveRoomId} onChange={(e) => setMoveRoomId(e.target.value)}>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>יום בשבוע</Label>
                <Select value={moveDow} onChange={(e) => setMoveDow(Number(e.target.value))}>
                  {DAY_NAMES.map((n, i) => (
                    <option key={i} value={i}>
                      יום {n}
                    </option>
                  ))}
                </Select>
              </div>
              <HoursPicker hours={hours} startMin={moveStart} setStartMin={setMoveStart} endMin={moveEnd} setEndMin={setMoveEnd} />
              <Button
                className="w-full"
                size="sm"
                disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(moveDate)}
                onClick={() =>
                  run(() =>
                    scheduleAssignmentMove({
                      assignmentId: cell.refId,
                      fromDate: moveDate,
                      newRoomId: moveRoomId,
                      newDayOfWeek: moveDow,
                      newStartMin: moveStart,
                      newEndMin: moveEnd,
                    })
                  )
                }
              >
                תזמון השינוי
              </Button>
              <p className="text-xs text-muted-foreground">עד התאריך הכל נשאר כרגיל; מהתאריך השינוי חל אוטומטית.</p>
            </div>
          )}
        </div>
      )}

      {/* admin-only double booking */}
      {!cell.second && !isLabel && (
        <div className="rounded-xl border border-border p-3">
          <button className="flex w-full items-center gap-1.5 text-sm font-medium" onClick={() => setShowPair(!showPair)}>
            <UserPlus size={15} className="text-primary" />
            שיבוץ איש צוות נוסף באותה שעה
          </button>
          {showPair && (
            <div className="mt-3 space-y-2">
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                שיבוץ כפול: שני אנשי צוות יופיעו יחד בחדר בשעות החופפות. אפשרי רק לניהול.
              </p>
              <div>
                <Label>מטפל/ת נוסף/ת</Label>
                <Select value={pairUserId} onChange={(e) => setPairUserId(e.target.value)}>
                  {users
                    .filter((u) => u.id !== cell.userId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              </div>
              <HoursPicker hours={hours} startMin={pairStart} setStartMin={setPairStart} endMin={pairEnd} setEndMin={setPairEnd} />
              <Button
                className="w-full"
                size="sm"
                disabled={pending || !pairUserId}
                onClick={() =>
                  run(() =>
                    adminCreateBooking({ userId: pairUserId, roomId: room.id, date, startMin: pairStart, endMin: pairEnd, kind: "regular" })
                  )
                }
              >
                שיבוץ כפול לשעה זו
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
