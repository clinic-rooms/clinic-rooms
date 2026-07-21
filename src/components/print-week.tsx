"use client";

import { Printer } from "lucide-react";
import { fmtMin, slotToMin, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe } from "@/lib/dates";

type PrintCell = { name?: string; color?: string; closed?: boolean };
export type PrintDay = {
  date: string;
  closure: { type: "closed" | "early"; label: string; endMin: number } | null;
  rooms: { name: string; cells: PrintCell[] }[];
};

export function PrintWeek({
  clinicName,
  days,
  bounds,
}: {
  clinicName: string;
  days: PrintDay[];
  bounds: SlotBounds;
}) {
  const nSlots = (bounds.dayEndMin - bounds.dayStartMin) / SLOT_MIN;
  return (
    <div className="min-h-dvh bg-white p-4 text-black">
      <style>{`
        @page { size: landscape; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .print-day { break-inside: avoid; page-break-after: always; }
          .print-day:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">לוח שבועי להדפסה — {clinicName}</h1>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Printer size={16} />
          הדפסה / שמירה כ-PDF
        </button>
      </div>

      {days.map((day) => (
        <div key={day.date} className="print-day mb-6">
          <h2 className="mb-1 text-base font-bold">
            {fmtDateHe(day.date, { year: "numeric" })}
            {day.closure && (
              <span className="ms-2 text-sm font-normal">
                {day.closure.type === "closed"
                  ? `— סגור (${day.closure.label})`
                  : `— ${day.closure.label}, עד ${fmtMin(day.closure.endMin)}`}
              </span>
            )}
          </h2>
          {day.rooms.length === 0 ? (
            <p className="text-sm text-gray-500">אין חדרים פעילים ביום זה.</p>
          ) : (
            <table className="w-full border-collapse text-[9px]" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-0.5 font-semibold" style={{ width: 34 }}>
                    שעה
                  </th>
                  {day.rooms.map((r) => (
                    <th key={r.name} className="border border-gray-400 bg-gray-100 p-0.5 font-semibold">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: nSlots }, (_, slot) => (
                  <tr key={slot}>
                    <td className="border border-gray-300 bg-gray-50 p-0.5 text-center" dir="ltr">
                      {fmtMin(slotToMin(bounds, slot))}
                    </td>
                    {day.rooms.map((r) => {
                      const c = r.cells[slot];
                      const prev = slot > 0 ? r.cells[slot - 1] : undefined;
                      const segStart = c.name && (!prev || prev.name !== c.name);
                      return (
                        <td
                          key={r.name}
                          className="h-3.5 border border-gray-300 p-0 text-center align-middle"
                          style={{
                            backgroundColor: c.closed
                              ? "#eee"
                              : c.color
                                ? `color-mix(in srgb, ${c.color} 30%, white)`
                                : "white",
                          }}
                        >
                          {segStart && <span className="px-0.5 leading-none">{c.name}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
