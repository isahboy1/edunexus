 
import "dotenv/config";
import bcrypt from "bcryptjs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { readSeedCredentials, resolveSeedPassword } from "../src/lib/seed-credentials";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ROLE_NAMES = [
  "SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER",
  "BURSARY_OFFICER", "HOD", "LECTURER", "STUDENT", "APPLICANT",
] as const;

const PERMISSIONS: [string, string][] = [
  ["applications.view", "View applications"],
  ["applications.review", "Review applications"],
  ["applications.approve", "Approve (admit) applications"],
  ["applications.reject", "Reject applications"],
  ["students.view", "View student records"],
  ["students.update", "Update student records"],
  ["results.enter", "Enter results"],
  ["results.submit", "Submit results"],
  ["results.approve", "Approve results"],
  ["results.publish", "Publish results"],
  ["payments.view", "View payments"],
  ["payments.verify", "Verify payments"],
  ["users.create", "Create users"],
  ["users.update", "Update users"],
  ["settings.manage", "Manage system settings"],
  ["audit.view", "View audit logs"],
];

// Role → permissions map
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map(([n]) => n),
  // Sub-admin: user management only — create users & reset passwords
  ADMIN: ["users.create", "users.update"],
  REGISTRAR: [
    "applications.view", "applications.review", "applications.approve", "applications.reject",
    "students.view", "students.update", "audit.view",
  ],
  ADMISSIONS_OFFICER: ["applications.view", "applications.review", "applications.approve", "applications.reject"],
  ACADEMIC_OFFICER: ["students.view", "results.enter", "results.submit", "results.approve", "results.publish"],
  BURSARY_OFFICER: ["payments.view", "payments.verify"],
  HOD: ["applications.view", "students.view", "results.enter", "results.submit"],
  LECTURER: ["results.enter", "results.submit"],
  STUDENT: [],
  APPLICANT: [],
};

async function main() {
  console.log("🌱 Seeding EDUNEXUS…");

  // 1. Roles & permissions
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: name.replace(/_/g, " ") },
    });
  }
  const permissionRows = await Promise.all(
    PERMISSIONS.map(async ([name, description]) =>
      prisma.permission.upsert({ where: { name }, update: {}, create: { name, description } })
    )
  );
  const permByName = Object.fromEntries(permissionRows.map((p) => [p.name, p.id]));
  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName as never } });
    if (!role) continue;
    for (const pn of permNames) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permByName[pn] } },
        update: {},
        create: { roleId: role.id, permissionId: permByName[pn] },
      });
    }
  }
  console.log("  ✓ roles & permissions");

  // 2. Academic session + semesters
  const year = new Date().getFullYear();
  const sessionName = `${year}/${year + 1}`;
  const session = await prisma.academicSession.upsert({
    where: { name: sessionName },
    update: { isCurrent: true, status: "ACTIVE" },
    create: {
      name: sessionName,
      startDate: new Date(`${year}-10-01`),
      endDate: new Date(`${year + 1}-07-31`),
      isCurrent: true,
      status: "ACTIVE",
      semesters: {
        create: [
          { name: "FIRST", startDate: new Date(`${year}-10-01`), endDate: new Date(`${year + 1}-02-01`), status: "REGISTRATION" },
          { name: "SECOND", startDate: new Date(`${year + 1}-03-01`), endDate: new Date(`${year + 1}-07-31`), status: "UPCOMING" },
        ],
      },
    },
  });
  console.log(`  ✓ academic session ${sessionName}`);

  // 3. Levels
  for (const v of [100, 200, 300, 400]) {
    await prisma.level.upsert({
      where: { numericValue: v },
      update: {},
      create: { numericValue: v, name: `${v} Level` },
    });
  }

  // 4. Faculties → departments → programmes
  const structure: {
    faculty: [string, string];
    departments: { name: string; code: string; programmes: [string, string, string][] }[];
  }[] = [
    {
      faculty: ["School of Education", "EDU"],
      departments: [
        {
          name: "Educational Administration & Planning", code: "EAP",
          programmes: [
            ["B.Ed Educational Administration & Planning", "BED-EAP", "B.Ed"],
            ["B.Ed Guidance & Counselling", "BED-GNC", "B.Ed"],
          ],
        },
        {
          name: "English Education", code: "ENG",
          programmes: [["B.Ed English Education", "BED-ENG", "B.Ed"]],
        },
      ],
    },
    {
      faculty: ["School of Legal Studies", "ILS"],
      departments: [
        {
          name: "Islamic Studies", code: "ISL",
          programmes: [["B.A Islamic Studies", "BA-ISL", "B.A"]],
        },
        {
          name: "Arabic Studies", code: "ARB",
          programmes: [["B.A Arabic", "BA-ARB", "B.A"]],
        },
      ],
    },
    {
      faculty: ["School of Sciences", "SCI"],
      departments: [
        {
          name: "Computer Science", code: "CSC",
          programmes: [["B.Sc Computer Science", "BSC-CSC", "B.Sc"]],
        },
        {
          name: "Economics", code: "ECO",
          programmes: [["B.Sc Economics", "BSC-ECO", "B.Sc"]],
        },
      ],
    },
  ];

  for (const f of structure) {
    const faculty = await prisma.faculty.upsert({
      where: { code: f.faculty[1] },
      update: {},
      create: { name: f.faculty[0], code: f.faculty[1] },
    });
    for (const d of f.departments) {
      const department = await prisma.department.upsert({
        where: { code: d.code },
        update: {},
        create: { name: d.name, code: d.code, facultyId: faculty.id },
      });
      for (const [name, code, award] of d.programmes) {
        await prisma.programme.upsert({
          where: { code },
          update: {},
          create: { name, code, award, departmentId: department.id, durationYears: 4 },
        });
      }
    }
  }
  console.log("  ✓ faculties, departments, programmes");

  // 5. Sample courses
  const csc = await prisma.department.findUnique({ where: { code: "CSC" } });
  if (csc) {
    const courses = [
      ["CSC101", "Introduction to Computing", 3, "FIRST", "CORE"],
      ["CSC102", "Problem Solving & Programming", 3, "SECOND", "CORE"],
      ["CSC201", "Data Structures", 3, "FIRST", "CORE"],
      ["GST101", "Use of English I", 2, "FIRST", "GST"],
      ["GST102", "Use of English II", 2, "SECOND", "GST"],
    ] as const;
    for (const [code, title, creditUnits, semester, courseType] of courses) {
      await prisma.course.upsert({
        where: { code },
        update: {},
        create: { code, title, creditUnits, semester, courseType, departmentId: csc.id, levelValue: code.startsWith("GST") ? 100 : 100 },
      });
    }
    // CSC201 requires CSC101
    const csc101 = await prisma.course.findUnique({ where: { code: "CSC101" } });
    const csc201 = await prisma.course.findUnique({ where: { code: "CSC201" } });
    if (csc101 && csc201) {
      await prisma.coursePrerequisite.upsert({
        where: { courseId_prerequisiteCourseId: { courseId: csc201.id, prerequisiteCourseId: csc101.id } },
        update: {},
        create: { courseId: csc201.id, prerequisiteCourseId: csc101.id },
      });
    }
    console.log("  ✓ sample courses");
  }

  // 6. Staff users — credentials from the SHARED seed-credentials.json
  // (same file the Laravel DatabaseSeeder reads, so both apps' demo
  // accounts can never drift apart). SEED_ADMIN_PASSWORD still overrides.
  const credentials = readSeedCredentials(join(import.meta.dirname, ".."));
  const defaultPassword = resolveSeedPassword(credentials, process.env.SEED_ADMIN_PASSWORD);
  const hash = await bcrypt.hash(defaultPassword, 12);
  const officeByEmail: Record<string, string> = {
    "admin@edunexus.edu.ng": "Registry",
    "subadmin@edunexus.edu.ng": "Registry",
    "registrar@edunexus.edu.ng": "Registry",
    "admissions@edunexus.edu.ng": "Admissions Unit",
    "academic@edunexus.edu.ng": "Academic Office",
    "bursary@edunexus.edu.ng": "Bursary",
    "hod@edunexus.edu.ng": "Academic Office",
    "lecturer@edunexus.edu.ng": "Academic Office",
  };
  for (const c of credentials.staff) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        passwordHash: hash,
        userRoles: { create: [{ role: { connect: { name: c.role as never } } }] },
      },
    });
    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, office: officeByEmail[c.email] ?? "Registry" },
    });
  }
  console.log(`  ✓ staff users (password: ${defaultPassword})`);

  // 7. Admission window for the current session (admin-configurable fee — SRS §13)
  await prisma.applicationSetting.upsert({
    where: { academicSessionId: session.id },
    update: { isActive: true },
    create: {
      academicSessionId: session.id,
      applicationFee: 5500,
      currency: "NGN",
      isActive: true,
      allowedTypes: ["UTME", "DIRECT_ENTRY", "PART_TIME", "LONG_VACATION"],
    },
  });
  console.log("  ✓ admission window (₦5,500 fee, open)");

  // 8. News & announcements for the public site
  const newsItems = [
    {
      title: `${sessionName} Admission Application Now Open`,
      content:
        "Applications are invited from suitably qualified candidates for admission into the various programmes of the institution for the academic session. Interested applicants should create an account on the portal, complete the online application form, upload their credentials and pay the application fee.",
      excerpt: "Online applications for the new academic session are now open.",
    },
    {
      title: "Guidelines for Online Application",
      content:
        "Applicants must possess a minimum of five (5) O-Level credits including English Language and Mathematics. UTME candidates must provide a valid JAMB registration number. Direct Entry applicants should upload NCE, ND, HND or IJMB certificates as applicable.",
      excerpt: "Check that your credentials meet the requirements before applying.",
    },
  ];
  for (const [i, n] of newsItems.entries()) {
    await prisma.news.upsert({
      where: { slug: `admission-${sessionName.replace("/", "-")}-${i}` },
      update: {},
      create: {
        title: n.title,
        slug: `admission-${sessionName.replace("/", "-")}-${i}`,
        content: n.content,
        excerpt: n.excerpt,
        authorName: "Registry",
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - i * 86_400_000),
      },
    });
  }
  await prisma.announcement.create({
    data: {
      title: "Application deadline approaching",
      message: "Ensure you complete and submit your application before the deadline. Late applications will not be processed.",
      audience: "APPLICANTS",
      status: "PUBLISHED",
    },
  });
  console.log("  ✓ news & announcements");

  // 9. Student testimonials for the public homepage (draft→publish pipeline).
  // Idempotent: only seed when the table is still empty.
  const existingTestimonials = await prisma.testimonial.count();
  if (existingTestimonials === 0) {
    const testimonials = [
      {
        studentName: "Aisha Bello",
        role: "B.Sc Computer Science, 2025",
        quote:
          "From application to course registration, everything happened in one portal. I never had to queue at a single office — even my fees and receipts were handled online.",
        displayOrder: 1,
      },
      {
        studentName: "Musa Ibrahim",
        role: "B.A Education, 2024",
        quote:
          "Checking my admission status the moment it was released, from my phone, was a relief. The portal told me exactly what was happening at every stage.",
        displayOrder: 2,
      },
      {
        studentName: "Fatima Yusuf",
        role: "B.Sc Business Administration, 2026",
        quote:
          "Course registration, results and the library form were all approved without a single piece of paper. It is how a modern school should run.",
        displayOrder: 3,
      },
    ];
    await prisma.testimonial.createMany({
      data: testimonials.map((t, i) => ({
        ...t,
        status: "PUBLISHED" as const,
        publishedAt: new Date(Date.now() - i * 86_400_000),
      })),
    });
    console.log("  ✓ testimonials (3 published)");
  }

  console.log("✅ Seed complete.");
  console.log("   Admin login: admin@edunexus.edu.ng / " + defaultPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
