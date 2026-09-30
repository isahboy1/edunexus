import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contactInfoSchema,
  jambSchema,
  olevelSchema,
  personalInfoSchema,
  programmeSchema,
  qualificationSchema,
  registerSchema,
} from "../../src/lib/validators";

// The same payload shapes scripts/smoke.mjs drives through the live wizard —
// these tests pin the API contract at the schema level so a validation change
// that would break the smoke suite is caught without a server.

describe("registerSchema (FR-001 applicant signup)", () => {
  const base = {
    surname: "Smoke",
    firstName: "Tester",
    email: "smoke@example.com",
    phone: "08123456789",
    password: "Passw0rd1",
    confirmPassword: "Passw0rd1",
  };

  it("accepts the smoke-suite payload", () => {
    assert.equal(registerSchema.safeParse(base).success, true);
  });

  it("requires 8+ chars with at least one letter and one digit", () => {
    assert.equal(registerSchema.safeParse({ ...base, password: "Sh0rt1" }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, password: "nodigitsatall" }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, password: "12345678" }).success, false);
  });

  it("rejects mismatched password confirmation", () => {
    assert.equal(registerSchema.safeParse({ ...base, confirmPassword: "Passw0rd2" }).success, false);
  });

  it("rejects invalid phone formats", () => {
    assert.equal(registerSchema.safeParse({ ...base, phone: "abc" }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, phone: "08123" }).success, false);
  });
});

describe("personalInfoSchema (BIODATA stage)", () => {
  const base = {
    surname: "Smoke",
    firstName: "Bulk",
    dateOfBirth: "2004-05-10",
    gender: "MALE",
    maritalStatus: "SINGLE",
    stateOfOrigin: "Kano",
    lga: "Nassarawa",
    phone: "08123456789",
    residentialAddress: "12 Zoo Road, Kano",
    permanentAddress: "12 Zoo Road, Kano",
    emergencyContactName: "Parent Bulk",
    emergencyContactPhone: "08087654322",
  };

  it("accepts the smoke-suite payload", () => {
    assert.equal(personalInfoSchema.safeParse(base).success, true);
  });

  it("defaults nationality to Nigerian when omitted", () => {
    const parsed = personalInfoSchema.parse(base);
    assert.equal(parsed.nationality, "Nigerian");
  });

  it("requires the AKCILS biodata contact fields in one save", () => {
    const missing = { ...base };
    delete (missing as Record<string, unknown>).permanentAddress;
    assert.equal(personalInfoSchema.safeParse(missing).success, false);
  });

  it("rejects unknown gender values", () => {
    assert.equal(personalInfoSchema.safeParse({ ...base, gender: "OTHER" }).success, false);
  });
});

describe("contactInfoSchema", () => {
  const base = {
    permanentAddress: "12 Zoo Road, Kano",
    currentDateAddress: "12 Zoo Road, Kano",
    emergencyContactName: "Parent Bulk",
    emergencyContactPhone: "08087654322",
  };

  it("accepts the smoke-suite payload (emergency address optional)", () => {
    assert.equal(contactInfoSchema.safeParse(base).success, true);
    assert.equal(
      contactInfoSchema.safeParse({ ...base, emergencyContactAddress: "Same as above" }).success,
      true
    );
  });

  it("rejects short current-address values", () => {
    assert.equal(contactInfoSchema.safeParse({ ...base, currentDateAddress: "Kano" }).success, false);
  });
});

describe("programmeSchema", () => {
  it("accepts the smoke-suite payload", () => {
    assert.equal(
      programmeSchema.safeParse({
        programmeId: "0b9e6c35-f88b-4c77-a1b1-f7d1e206d27c",
        applicationType: "UTME",
        studyMode: "FULL_TIME",
      }).success,
      true
    );
  });

  it("requires a UUID programme id and known application types", () => {
    assert.equal(
      programmeSchema.safeParse({ programmeId: "not-a-uuid", applicationType: "UTME", studyMode: "FULL_TIME" })
        .success,
      false
    );
    assert.equal(
      programmeSchema.safeParse({
        programmeId: "0b9e6c35-f88b-4c77-a1b1-f7d1e206d27c",
        applicationType: "MAGIC",
        studyMode: "FULL_TIME",
      }).success,
      false
    );
  });

  it("bounds entryLevelValue between 100 and 500", () => {
    const base = { programmeId: "0b9e6c35-f88b-4c77-a1b1-f7d1e206d27c", applicationType: "UTME", studyMode: "FULL_TIME" };
    assert.equal(programmeSchema.safeParse({ ...base, entryLevelValue: 50 }).success, false);
    assert.equal(programmeSchema.safeParse({ ...base, entryLevelValue: 200 }).success, true);
    assert.equal(programmeSchema.safeParse({ ...base, entryLevelValue: 600 }).success, false);
  });
});

describe("jambSchema", () => {
  const base = {
    registrationNumber: "SMOKE1234567",
    examinationYear: 2026,
    utmeScore: 245,
    institutionChoice: "EDUNEXUS",
    subjects: [
      { subject: "English", score: 65 },
      { subject: "Maths", score: 70 },
    ],
  };

  it("accepts the smoke-suite payload", () => {
    assert.equal(jambSchema.safeParse(base).success, true);
  });

  it("caps subjects at 4 and scores at 400", () => {
    const four = base.subjects.concat([{ subject: "Biology", score: 60 }, { subject: "Chemistry", score: 55 }]);
    assert.equal(jambSchema.safeParse({ ...base, subjects: four }).success, true);
    assert.equal(jambSchema.safeParse({ ...base, subjects: four.concat({ subject: "Extra", score: 50 }) }).success, false);
    assert.equal(jambSchema.safeParse({ ...base, utmeScore: 401 }).success, false);
  });

  it("coerces numeric strings from form inputs", () => {
    assert.equal(
      jambSchema.safeParse({ ...base, examinationYear: "2026", utmeScore: "245" }).success,
      true
    );
  });
});

describe("olevelSchema", () => {
  const base = {
    examinationType: "WAEC",
    examinationNumber: "WAE1234567",
    examinationYear: 2023,
    sittingNumber: 1,
    subjects: [
      { subject: "English Language", grade: "C4" },
      { subject: "Mathematics", grade: "B3" },
      { subject: "Physics", grade: "C5" },
      { subject: "Chemistry", grade: "C6" },
      { subject: "Biology", grade: "B3" },
    ],
  };

  it("accepts the smoke-suite payload (5 subjects, first sitting)", () => {
    assert.equal(olevelSchema.safeParse(base).success, true);
  });

  it("requires at least 5 subjects — the submission gate depends on this", () => {
    assert.equal(
      olevelSchema.safeParse({ ...base, subjects: base.subjects.slice(0, 4) }).success,
      false
    );
  });

  it("allows up to 9 subjects and sittings 1-3", () => {
    const nine = base.subjects.concat(
      { subject: "Geography", grade: "C6" },
      { subject: "Economics", grade: "C6" },
      { subject: "Agricultural Science", grade: "C6" },
      { subject: "Civic Education", grade: "C6" }
    );
    assert.equal(olevelSchema.safeParse({ ...base, subjects: nine }).success, true);
    assert.equal(olevelSchema.safeParse({ ...base, sittingNumber: 2 }).success, true);
    assert.equal(olevelSchema.safeParse({ ...base, sittingNumber: 4 }).success, false);
  });

  it("restricts examination types to the WAEC/NECO/NABTEB/NBAIS/OTHER set", () => {
    assert.equal(olevelSchema.safeParse({ ...base, examinationType: "JAMB" }).success, false);
  });
});

describe("qualificationSchema (direct-entry qualifications)", () => {
  const base = { qualification: "NCE", institution: "Federal College of Education, Kano", year: 2024 };

  it("accepts a minimal qualification", () => {
    assert.equal(qualificationSchema.safeParse(base).success, true);
  });

  it("rejects unknown qualification types and out-of-range years", () => {
    assert.equal(qualificationSchema.safeParse({ ...base, qualification: "PHD" }).success, false);
    assert.equal(qualificationSchema.safeParse({ ...base, year: 1979 }).success, false);
  });
});
