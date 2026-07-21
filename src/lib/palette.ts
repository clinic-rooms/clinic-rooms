/**
 * User color+pattern palette. 24 well-separated hues × 3 patterns = 72 distinct
 * visual identities, so every therapist can always get a unique look.
 */

export type Pattern = "solid" | "stripes" | "dots";

export const PALETTE_COLORS = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a",
  "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5",
  "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48", "#b91c1c",
  "#9a3412", "#3f6212", "#065f46", "#155e75", "#1e40af", "#6b21a8",
];

export const PATTERNS: Pattern[] = ["solid", "stripes", "dots"];

/** All (color, pattern) combos, solids first, then stripes, then dots. */
export function paletteCombos(): { color: string; pattern: Pattern }[] {
  const out: { color: string; pattern: Pattern }[] = [];
  for (const pattern of PATTERNS) for (const color of PALETTE_COLORS) out.push({ color, pattern });
  return out;
}

/** First combo not already taken; falls back to a deterministic pick if all used. */
export function nextFreeCombo(taken: { color: string; pattern: string }[]): {
  color: string;
  pattern: Pattern;
} {
  const used = new Set(taken.map((t) => `${t.color}|${t.pattern}`));
  for (const combo of paletteCombos()) {
    if (!used.has(`${combo.color}|${combo.pattern}`)) return combo;
  }
  const combos = paletteCombos();
  return combos[taken.length % combos.length];
}

/** Inline style for a grid cell background given the occupant's color+pattern. */
export function cellStyle(color: string, pattern: string): React.CSSProperties {
  const base = `color-mix(in srgb, ${color} 82%, white)`;
  if (pattern === "stripes") {
    return {
      backgroundColor: base,
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 3px, transparent 3px 7px)",
    };
  }
  if (pattern === "dots") {
    return {
      backgroundColor: base,
      backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1.1px, transparent 1.3px)",
      backgroundSize: "6px 6px",
    };
  }
  return { backgroundColor: base };
}

/** Inline style for an avatar circle given color+pattern. */
export function avatarStyle(color: string, pattern: string): React.CSSProperties {
  if (pattern === "stripes") {
    return {
      backgroundColor: color,
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 5px)",
    };
  }
  if (pattern === "dots") {
    return {
      backgroundColor: color,
      backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1.2px)",
      backgroundSize: "5px 5px",
    };
  }
  return { backgroundColor: color };
}
