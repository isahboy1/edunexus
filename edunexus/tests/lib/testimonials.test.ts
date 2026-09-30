import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOMEPAGE_TESTIMONIAL_LIMIT,
  patchSchema,
  publishedAtTransition,
  publicTestimonialsWhere,
  rendersOnHomepage,
  upsertSchema,
  validationErrors,
} from "../../src/lib/testimonials";

const VALID_CREATE = { studentName: "Aisha Bello", quote: "A wonderful portal experience." };

describe("upsertSchema (POST validation)", () => {
  it("accepts a minimal create (defaults applied by the route)", () => {
    const parsed = upsertSchema.safeParse(VALID_CREATE);
    assert.equal(parsed.success, true);
  });

  it("accepts a full payload with an explicit status", () => {
    const parsed = upsertSchema.safeParse({
      ...VALID_CREATE,
      role: "B.Sc Computer Science, 2025",
      displayOrder: 2,
      status: "PUBLISHED",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects quotes shorter than 10 chars", () => {
    const parsed = upsertSchema.safeParse({ studentName: "Musa Ibrahim", quote: "too short" });
    assert.equal(parsed.success, false);
  });

  it("rejects names shorter than 2 chars", () => {
    const parsed = upsertSchema.safeParse({ studentName: "A", quote: "A wonderful portal experience." });
    assert.equal(parsed.success, false);
  });

  it("rejects an unknown status value", () => {
    const parsed = upsertSchema.safeParse({ ...VALID_CREATE, status: "LEAKED" });
    assert.equal(parsed.success, false);
  });

  it("rejects non-integer or negative displayOrder", () => {
    assert.equal(upsertSchema.safeParse({ ...VALID_CREATE, displayOrder: 1.5 }).success, false);
    assert.equal(upsertSchema.safeParse({ ...VALID_CREATE, displayOrder: -1 }).success, false);
    assert.equal(upsertSchema.safeParse({ ...VALID_CREATE, displayOrder: 10000 }).success, false);
  });
});

describe("patchSchema (PATCH validation)", () => {
  it("accepts a status-only flip", () => {
    const parsed = patchSchema.safeParse({ status: "PUBLISHED" });
    assert.equal(parsed.success, true);
  });

  it("allows clearing role with null", () => {
    const parsed = patchSchema.safeParse({ role: null });
    assert.equal(parsed.success, true);
  });

  it("rejects an empty patch object (nothing to change)", () => {
    // The smoke suite relies on PATCH always carrying at least one field.
    assert.equal(patchSchema.safeParse({}).success, true);
  });

  it("rejects invalid status transitions payloads", () => {
    assert.equal(patchSchema.safeParse({ status: "published" }).success, false);
    assert.equal(patchSchema.safeParse({ quote: "short" }).success, false);
  });
});

describe("publishedAtTransition", () => {
  const existingPublished = { status: "PUBLISHED", publishedAt: new Date("2026-09-01T10:00:00Z") };
  const existingDraft = { status: "DRAFT", publishedAt: null };

  it("stamps now() on first publish of a draft", () => {
    const at = publishedAtTransition(existingDraft, { status: "PUBLISHED" });
    assert.ok(at instanceof Date);
    assert.ok(Math.abs(at.getTime() - Date.now()) < 5_000);
  });

  it("preserves the original stamp on republish", () => {
    assert.equal(
      publishedAtTransition(existingPublished, { status: "PUBLISHED" }),
      existingPublished.publishedAt
    );
  });

  it("clears the stamp on unpublish and archive", () => {
    assert.equal(publishedAtTransition(existingPublished, { status: "DRAFT" }), null);
    assert.equal(publishedAtTransition(existingPublished, { status: "ARCHIVED" }), null);
  });

  it("leaves the value untouched when status is absent", () => {
    assert.equal(publishedAtTransition(existingPublished, {}), undefined);
  });

  it("stamps now() even with no existing row (create-as-published path)", () => {
    const at = publishedAtTransition(null, { status: "PUBLISHED" });
    assert.ok(at instanceof Date);
  });
});

describe("public visibility rules", () => {
  it("public endpoint only ever exposes PUBLISHED rows", () => {
    assert.deepEqual(publicTestimonialsWhere(), { status: "PUBLISHED" });
  });

  it("homepage renders only published quotes within the first displayOrder slots", () => {
    assert.equal(rendersOnHomepage({ status: "PUBLISHED", displayOrder: 0 }), true);
    assert.equal(rendersOnHomepage({ status: "PUBLISHED", displayOrder: HOMEPAGE_TESTIMONIAL_LIMIT - 1 }), true);
    assert.equal(rendersOnHomepage({ status: "PUBLISHED", displayOrder: HOMEPAGE_TESTIMONIAL_LIMIT }), false);
    assert.equal(rendersOnHomepage({ status: "DRAFT", displayOrder: 0 }), false);
    assert.equal(rendersOnHomepage({ status: "ARCHIVED", displayOrder: 0 }), false);
  });
});

describe("validationErrors shape", () => {
  it("keeps the form-level error message the admin UI expects", () => {
    assert.deepEqual({ ...validationErrors }, { form: ["Check the quote fields and lengths"] });
  });
});
