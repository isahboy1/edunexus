import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, ok } from "@/lib/api";
import { requireRole, recordAudit } from "@/lib/auth";

// GET /api/v1/admin/structure — faculties -> departments -> programmes (+ levels, courses)
export async function GET() {
  return handle(async () => {
    await requireRole("SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD");
    const [faculties, levels, courses] = await Promise.all([
      prisma.faculty.findMany({
        orderBy: { name: "asc" },
        include: {
          departments: {
            orderBy: { name: "asc" },
            include: { programmes: { orderBy: { name: "asc" } } },
          },
        },
      }),
      prisma.level.findMany({ orderBy: { numericValue: "asc" } }),
      prisma.course.findMany({
        orderBy: { code: "asc" },
        include: { department: { select: { name: true, code: true } } },
      }),
    ]);
    return ok({ faculties, levels, courses });
  });
}

// POST /api/v1/admin/structure — body: { kind: "faculty"|"department"|"programme"|"level"|"course", ...fields }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const staff = await requireRole("SUPER_ADMIN", "ACADEMIC_OFFICER");
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const kind = body?.kind as string | undefined;
    if (!kind) return fail("Validation failed", 422, { kind: ["kind is required"] });

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));

    switch (kind) {
      case "faculty": {
        const name = str(body?.name);
        const code = str(body?.code).toUpperCase();
        if (!name || !code) return fail("Validation failed", 422, { name: ["Name and code are required"] });
        const faculty = await prisma.faculty.create({ data: { name, code, description: str(body?.description) || null } });
        await recordAudit({ userId: staff.id, action: "FACULTY_CREATED", entityType: "Faculty", entityId: faculty.id, newValues: { name, code } });
        return created({ faculty }, "Faculty created");
      }
      case "department": {
        const name = str(body?.name);
        const code = str(body?.code).toUpperCase();
        const facultyId = str(body?.facultyId);
        if (!name || !code || !facultyId) return fail("Validation failed", 422, { name: ["Name, code and facultyId are required"] });
        const department = await prisma.department.create({ data: { name, code, facultyId, description: str(body?.description) || null } });
        await recordAudit({ userId: staff.id, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: department.id, newValues: { name, code } });
        return created({ department }, "Department created");
      }
      case "programme": {
        const name = str(body?.name);
        const code = str(body?.code).toUpperCase();
        const departmentId = str(body?.departmentId);
        if (!name || !code || !departmentId) return fail("Validation failed", 422, { name: ["Name, code and departmentId are required"] });
        const programme = await prisma.programme.create({
          data: {
            name, code, departmentId,
            award: str(body?.award) || null,
            durationYears: num(body?.durationYears),
            description: str(body?.description) || null,
          },
        });
        await recordAudit({ userId: staff.id, action: "PROGRAMME_CREATED", entityType: "Programme", entityId: programme.id, newValues: { name, code } });
        return created({ programme }, "Programme created");
      }
      case "level": {
        const numericValue = num(body?.numericValue);
        const name = str(body?.name) || `${numericValue} Level`;
        if (!numericValue) return fail("Validation failed", 422, { numericValue: ["numericValue is required"] });
        const level = await prisma.level.create({ data: { numericValue, name } });
        return created({ level }, "Level created");
      }
      case "course": {
        const code = str(body?.code).toUpperCase();
        const title = str(body?.title);
        const departmentId = str(body?.departmentId);
        const creditUnits = num(body?.creditUnits);
        const courseType = str(body?.courseType) || "CORE";
        if (!code || !title || !departmentId || !creditUnits) {
          return fail("Validation failed", 422, { code: ["code, title, departmentId and creditUnits are required"] });
        }
        const course = await prisma.course.create({
          data: {
            code, title, departmentId, creditUnits,
            courseType: courseType as never,
            levelValue: num(body?.levelValue),
            semester: (str(body?.semester) || undefined) as never,
            description: str(body?.description) || null,
          },
        });
        await recordAudit({ userId: staff.id, action: "COURSE_CREATED", entityType: "Course", entityId: course.id, newValues: { code, title } });
        return created({ course }, "Course created");
      }
      default:
        return fail("Validation failed", 422, { kind: ["Unknown kind"] });
    }
  });
}
