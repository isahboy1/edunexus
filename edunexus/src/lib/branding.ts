/**
 * White-label colour engine.
 *
 * The admin picks ONE seed colour per brand role (primary + accent). This
 * module derives the full tint/shade ramp the design system consumes through
 * CSS variables (`--brand-50…950`, `--accent-500/600/100`), so a single pick
 * re-skins every portal, public page and PDF without touching globals.css.
 *
 * The ramp is produced by mixing the seed toward white (tints) or black
 * (shades) in sRGB space — predictable, perceptually even, and dependency-free.
 * `mixToWhite`/`mixToBlack` are also exported for the client-side live preview.
 *
 * Ramp mapping (from the shipped palette in globals.css):
 *   --brand-950/900/800  → seed darkened
 *   --brand-700          → the seed itself (the "button" colour)
 *   --brand-600/500      → seed lightened
 *   --brand-100/50       → very light tints
 *   --accent-500/600/100 → accent seed and its neighbours
 */

export interface Branding {
  primary: string; // #rrggbb — drives the whole brand ramp
  accent: string; // #rrggbb — success/secondary actions
  logoUrl: string | null; // custom crest, served by the API
}

export const DEFAULT_BRANDING: Branding = {
  primary: "#2B6074",
  accent: "#2D684F",
  logoUrl: null,
};

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

/** Parse `#rrggbb` (with or without `#`) → [r, g, b]. Returns null if invalid. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

function mix(rgb: [number, number, number], target: [number, number, number], amount: number): string {
  return toHex([
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount,
  ]);
}

/** Mix a colour toward white by `amount` (0 = unchanged, 1 = white). */
export function mixToWhite(hex: string, amount: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  return mix(rgb, [255, 255, 255], amount);
}

/** Mix a colour toward black by `amount` (0 = unchanged, 1 = black). */
export function mixToBlack(hex: string, amount: number): string {
  const rgb = parseHex(hex) ?? [255, 255, 255];
  return mix(rgb, [0, 0, 0], amount);
}

/**
 * Build the CSS custom-property block that overrides the design-system ramp.
 * Returns an empty string for the default palette so the shipped values in
 * globals.css stand (no needless style churn on every request).
 */
export function brandCssVars(primary: string, accent: string): string {
  const rgb = parseHex(primary);
  if (!rgb) return "";
  const aRgb = parseHex(accent);

  const isDefault =
    primary.toUpperCase() === DEFAULT_BRANDING.primary.toUpperCase() &&
    (accent.toUpperCase() === DEFAULT_BRANDING.accent.toUpperCase() || !aRgb);

  if (isDefault) return "";

  const vars: string[] = [
    `--brand-950:${mixToBlack(primary, 0.62)}`,
    `--brand-900:${mixToBlack(primary, 0.48)}`,
    `--brand-800:${mixToBlack(primary, 0.28)}`,
    `--brand-700:${primary.toLowerCase()}`,
    `--brand-600:${mixToWhite(primary, 0.12)}`,
    `--brand-500:${mixToWhite(primary, 0.35)}`,
    `--brand-100:${mixToWhite(primary, 0.82)}`,
    `--brand-50:${mixToWhite(primary, 0.92)}`,
    `--ring-brand: 0 0 0 3px ${mixToWhite(primary, 0.84)}`,
  ];

  if (aRgb) {
    vars.push(
      `--accent-500:${accent.toLowerCase()}`,
      `--accent-600:${mixToBlack(accent, 0.14)}`,
      `--accent-100:${mixToWhite(accent, 0.85)}`
    );
  }

  // Public-site header adopts the institution's primary once customised
  // (the shipped palette keeps its own teal via the component fallbacks).
  vars.push(
    `--site-header:${primary.toLowerCase()}`,
    `--site-header-deep:${mixToBlack(primary, 0.25)}`
  );

  return `:root{${vars.join(";")}}`;
}

/** Normalise any user-supplied value into a strict `#rrggbb` string (or null). */
export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  return rgb ? toHex(rgb) : null;
}
