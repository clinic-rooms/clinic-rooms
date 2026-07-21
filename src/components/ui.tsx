import * as React from "react";
import { cn } from "@/lib/utils";
import { avatarStyle } from "@/lib/palette";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ring cursor-pointer",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" && "bg-accent text-accent-foreground hover:opacity-90",
        variant === "ghost" && "hover:bg-muted",
        variant === "outline" && "border border-border bg-card hover:bg-muted",
        variant === "destructive" && "bg-destructive text-white hover:opacity-90",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        size === "icon" && "h-10 w-10",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium mb-1.5", className)} {...props} />;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-accent text-accent-foreground",
        variant === "outline" && "border border-border text-muted-foreground",
        variant === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
        className
      )}
      {...props}
    />
  );
}

export function Avatar({
  name,
  color,
  pattern = "solid",
  size = 24,
}: {
  name: string;
  color: string;
  pattern?: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{ ...avatarStyle(color, pattern), width: size, height: size, fontSize: size * 0.42 }}
    >
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">{initials}</span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
      {icon}
      <p className="font-medium text-foreground">{title}</p>
      {subtitle && <p className="text-sm">{subtitle}</p>}
    </div>
  );
}
