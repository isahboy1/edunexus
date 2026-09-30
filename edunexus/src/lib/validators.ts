import { z } from "zod";

// Shared Zod validators for API + client forms (SRS FR-001 & Section 11)

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const phoneSchema = z
  .string()
  .regex(/^[+]?[\d\s-]{7,20}$/, "Enter a valid phone number");

export const registerSchema = z
  .object({
    surname: z.string().min(2, "Surname is required").max(100),
    firstName: z.string().min(2, "First name is required").max(100),
    middleName: z.string().max(100).optional().or(z.literal("")),
    email: z.string().email("Enter a valid email address"),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const personalInfoSchema = z.object({
  surname: z.string().min(2, "Surname is required").max(100),
  firstName: z.string().min(2, "First name is required").max(100),
  middleName: z.string().max(100).optional().or(z.literal("")),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["MALE", "FEMALE"]),
  maritalStatus: z.string().min(1, "Marital status is required").max(30),
  nationality: z.string().min(1, "Nationality is required").max(100).default("Nigerian"),
  stateOfOrigin: z.string().min(1, "State of origin is required").max(100),
  lga: z.string().min(1, "LGA is required").max(100),
  religion: z.string().max(50).optional().or(z.literal("")),
  phone: phoneSchema,
  // Email belongs to the account and is not editable from this form
  email: z.string().email().optional().or(z.literal("")),
  residentialAddress: z.string().min(5, "Residential address is required").max(500),
  // BIODATA stage also collects the key contact fields (official AKCILS flow)
  permanentAddress: z.string().min(5, "Permanent address is required").max(500),
  emergencyContactName: z.string().min(2, "Emergency contact name is required").max(150),
  emergencyContactPhone: phoneSchema,
});

export const contactInfoSchema = z.object({
  permanentAddress: z.string().min(5, "Permanent address is required").max(500),
  currentDateAddress: z.string().min(5, "Current address is required").max(500),
  emergencyContactName: z.string().min(2, "Emergency contact name is required").max(150),
  emergencyContactPhone: phoneSchema,
  emergencyContactAddress: z.string().max(500).optional().or(z.literal("")),
});

export const programmeSchema = z.object({
  programmeId: z.string().uuid("Select a programme"),
  applicationType: z.enum([
    "UTME",
    "DIRECT_ENTRY",
    "PART_TIME",
    "LONG_VACATION",
    "NCE",
    "DIPLOMA",
    "OTHER",
  ]),
  studyMode: z.enum(["FULL_TIME", "PART_TIME", "SANDWICH", "REMOTE"]),
  entryLevelValue: z.number().int().min(100).max(500).optional(),
  firstChoiceProgrammeId: z.string().uuid().optional(),
  secondChoiceProgrammeId: z.string().uuid().optional(),
});

export const jambSchema = z.object({
  registrationNumber: z.string().min(6, "JAMB registration number is required").max(20),
  examinationYear: z.coerce.number().int().min(2000).max(2100),
  utmeScore: z.coerce.number().int().min(0).max(400).optional(),
  institutionChoice: z.string().max(255).optional().or(z.literal("")),
  subjects: z
    .array(
      z.object({
        subject: z.string().min(1, "Subject is required").max(100),
        score: z.coerce.number().int().min(0).max(100),
      })
    )
    .max(4)
    .optional(),
});

export const olevelSchema = z.object({
  examinationType: z.enum(["WAEC", "NECO", "NABTEB", "NBAIS", "OTHER"]),
  examinationNumber: z.string().min(5, "Exam number is required").max(100),
  examinationYear: z.coerce.number().int().min(1990).max(2100),
  sittingNumber: z.coerce.number().int().min(1).max(3),
  subjects: z
    .array(
      z.object({
        subject: z.string().min(1, "Subject is required").max(100),
        grade: z.string().min(1, "Grade is required").max(10),
      })
    )
    .min(5, "Enter at least 5 subjects with grades")
    .max(9),
});

export const qualificationSchema = z.object({
  qualification: z.enum(["NCE", "ND", "HND", "IJMB", "ALEVEL", "DIPLOMA", "DEGREE", "OTHER"]),
  institution: z.string().min(2, "Institution is required").max(200),
  certificate: z.string().max(200).optional().or(z.literal("")),
  gradeClass: z.string().max(100).optional().or(z.literal("")),
  year: z.coerce.number().int().min(1980).max(2100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type ContactInfoInput = z.infer<typeof contactInfoSchema>;
export type ProgrammeInput = z.infer<typeof programmeSchema>;
export type JambInput = z.infer<typeof jambSchema>;
export type OlevelInput = z.infer<typeof olevelSchema>;
export type QualificationInput = z.infer<typeof qualificationSchema>;
