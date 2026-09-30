import { z } from "zod";

/**
 * Shared validation + logic for the testimonial API routes
 * (`/api/v1/admin/testimonials` and `/api/v1/public/testimonials`).
 *
 * Extracted from the route files so the rules are unit-testable without a
 * running Next server; the routes stay thin handlers.
 */

export const TESTIMONIAL_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TestimonialStatus = (typeof TESTIMONIAL_STATUSES)[number];

const statusEnum = z.enum(TESTIMONIAL_STATUSES);

/** POST /api/v1/admin/testimonials — create a quote (DRAFT unless stated). */
export const upsertSchema = z.object({
  studentName: z.string().min(2).max(150),
  role: z.string().max(150).optional().nullable(),
  quote: z.string().min(10).max(600),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: statusEnum.optional(),
});

/** PATCH /api/v1/admin/testimonials/[id] — edit fields or flip status. */
export const patchSchema = z.object({
  studentName: z.string().min(2).max(150).optional(),
  role: z.string().max(150).nullable().optional(),
  quote: z.string().min(10).max(600).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: statusEnum.optional(),
});

/** Form-level errors object both admin routes return on validation failure. */
export const validationErrors: Record<string, string[]> = {
  form: ["Check the quote fields and lengths"],
};

/**
 * `publishedAt` handling for PATCH. Prisma semantics encoded here:
 *  - status unchanged/absent      → leave publishedAt as-is (undefined)
 *  - first transition → PUBLISHED → stamp now() (also when no row exists)
 *  - anything else                → clear it (null)
 */
export function publishedAtTransition(
  existing: { publishedAt: Date | null; status: string } | null,
  data: { status?: TestimonialStatus }
): Date | null | undefined {
  if (data.status === "PUBLISHED" && existing?.publishedAt) return existing.publishedAt;
  if (data.status === "PUBLISHED") return new Date();
  if (data.status) return null;
  return undefined;
}

/** Where clause the public endpoint applies — only published quotes. */
export function publicTestimonialsWhere() {
  return { status: "PUBLISHED" } as const;
}

/**
 * Homepage render rule: the public homepage section renders the first three
 * quotes ordered by displayOrder ascending, so a published quote with
 * displayOrder >= 3 will not appear there even though the public API lists it.
 */
export const HOMEPAGE_TESTIMONIAL_LIMIT = 3;

export function rendersOnHomepage(t: { status: string; displayOrder: number }): boolean {
  return t.status === "PUBLISHED" && t.displayOrder < HOMEPAGE_TESTIMONIAL_LIMIT;
}
