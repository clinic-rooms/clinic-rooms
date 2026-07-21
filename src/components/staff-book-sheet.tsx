"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, DoorOpen } from "lucide-react";
import { Button, Label, Select } from "@/components/ui";
import { fmtMin, slotToMin, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe } from "@/lib/dates";
import { confirmBooking, cancelBooking } from "@/actions/bookings";

/** Lightweight book-a-slot sheet for staff clicking a free cell on the board. */
export function StaffBookSheet({
  date,
  roomId,
  roomName,
  slot,
  bounds,
  onClose,
}: {
  date: string;
  roomId: string;
  roomName: string;
  slot: number;
  bounds: SlotBounds;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const HOURS: number[] = [];
  for (let m = bounds.dayStartMin; m <= bounds.dayEndMin; m += SLOT_MIN) HOURS.push(m);
  const clickedMin = slotToMin(bounds, slot);
  const [startMin, setStartMin] = useState(clickedMin);
  const [endMin, setEndMin] = useState(Math.min(clickedMin + 60, bounds.dayEndMin));

  function book() {
    startTransition(async () => {
      const res = await confirmBooking({ date, startMin, endMin, roomId, kind: "regular" });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const bookingId = res.bookingId;
      onClose();
      router.refresh();
      toast.success(`${roomName} שוריין לך!`, {
        action: bookingId
          ? {
              label: "ביטול",
              onClick: async () => {
                const undo = await cancelBooking(bookingId);
                if (undo.error) toast.error(undo.error);
                else {
                  toast.success("ההזמנה בוטלה");
                  router.refresh();
                }
              },
            }
          : undefined,
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-accent p-2 text-accent-foreground">
              <DoorOpen size={18} />
            </span>
            <div>
              <h3 className="font-bold">שריון {roomName}</h3>
              <p className="text-sm text-muted-foreground">{fmtDateHe(date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>משעה</Label>
            <Select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
              {HOURS.slice(0, -1).map((m) => (
                <option key={m} value={m}>
                  {fmtMin(m)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Label>עד שעה</Label>
            <Select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
              {HOURS.filter((m) => m > startMin).map((m) => (
                <option key={m} value={m}>
                  {fmtMin(m)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button className="mt-4 w-full" disabled={pending} onClick={book}>
          שריון החדר
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          אם החלון נתפס בינתיים — נעדכן אותך ותוכל לבחור שעה אחרת.
        </p>
      </div>
    </div>
  );
}
