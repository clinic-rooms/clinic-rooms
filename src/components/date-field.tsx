"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/dates";

/**
 * Date picker that always DISPLAYS Israeli DD/MM/YY, regardless of the
 * browser/OS locale (native <input type="date"> shows MM/DD/YYYY on
 * English-locale devices). The real input sits invisible on top, so a tap
 * anywhere opens the native picker.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-full cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm focus-within:outline-2 focus-within:outline-ring",
        className
      )}
    >
      <CalendarDays size={14} className="shrink-0 text-muted-foreground" />
      <span dir="ltr" className="tabular-nums">
        {value ? fmtDateShort(value) : ""}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
