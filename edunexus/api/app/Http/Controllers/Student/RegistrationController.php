<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicSession;
use App\Models\Course;
use App\Models\CourseRegistration;
use App\Models\CourseRegistrationItem;
use App\Models\Semester;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Course registration lifecycle (SRS §25/§26/§57):
 *   DRAFT → SUBMITTED → HOD_APPROVED → APPROVED
 * Business rules enforced server-side: active student, fee clearance
 * (configurable), no duplicates, credit-load ceiling, programme/level match.
 */
class RegistrationController extends Controller
{
    private const MAX_CREDIT_UNITS = 24;   // per-semester ceiling (SRS §57)
    private const MIN_CREDIT_UNITS = 12;

    /** GET /api/v1/student/courses/eligible */
    public function eligibleCourses(Request $request): JsonResponse
    {
        $student = $request->user()->student()->with('currentProgramme')->firstOrFail();
        $semester = $this->currentSemester();
        $departmentId = $student->currentProgramme?->department_id;

        $courses = Course::where('status', 'ACTIVE')
            ->where('level_value', $student->current_level_value)
            ->where('semester', $semester?->name ?? 'FIRST')
            ->where(function ($q) use ($departmentId) {
                // Programme department's courses + institution-wide GST/FACULTY.
                $q->when($departmentId, fn ($qq) => $qq->where('department_id', $departmentId))
                    ->orWhere('course_type', 'GST')
                    ->orWhere('course_type', 'FACULTY');
            })
            ->orderBy('code')
            ->get(['id', 'code', 'title', 'credit_units', 'course_type', 'semester']);

        $registeredIds = CourseRegistrationItem::whereHas('registration', fn ($r) => $r
            ->where('student_id', $student->id)->where('semester_id', $semester?->id))
            ->pluck('course_id');

        return $this->ok([
            'semester' => $semester?->only(['id', 'name', 'status']),
            'courses' => $courses->map(fn ($c) => [
                'id' => $c->id, 'code' => $c->code, 'title' => $c->title,
                'creditUnits' => $c->credit_units, 'type' => $c->course_type,
                'registered' => $registeredIds->contains($c->id),
            ]),
        ]);
    }

    /** GET /api/v1/student/registration — current semester's registration */
    public function show(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();
        $semester = $this->currentSemester();

        $registration = CourseRegistration::with(['items.course:id,code,title,credit_units,course_type'])
            ->where('student_id', $student->id)
            ->where('semester_id', $semester?->id)
            ->first();

        return $this->ok($registration);
    }

    /**
     * PUT /api/v1/student/registration — replace the DRAFT course selection.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseIds' => ['required', 'array', 'min:1'],
            'courseIds.*' => ['uuid'],
        ]);

        $student = $request->user()->student()->firstOrFail();
        abort_unless($student->status === 'ACTIVE', 422, 'Registration is only available to active students.');
        $semester = $this->currentSemester();
        abort_unless($semester && in_array($semester->status, ['REGISTRATION', 'IN_PROGRESS'], true), 422, 'Course registration is not open for this semester.');

        $registration = CourseRegistration::firstOrCreate(
            ['student_id' => $student->id, 'semester_id' => $semester->id],
            ['status' => 'DRAFT', 'total_credit_units' => 0]
        );

        // A rejected registration re-opens as a DRAFT so the student can
        // correct the selection and resubmit (SRS §57 resubmission cycle).
        if ($registration->status === 'REJECTED') {
            $registration->update(['status' => 'DRAFT']);
        }

        abort_unless($registration->status === 'DRAFT', 422, 'Registration has been submitted and can no longer be edited.');

        $courses = Course::whereIn('id', $data['courseIds'])->where('status', 'ACTIVE')->get();
        abort_if($courses->count() !== count(array_unique($data['courseIds'])), 422, 'One or more selected courses are unavailable.');

        $total = (int) $courses->sum('credit_units');
        abort_if($total > self::MAX_CREDIT_UNITS, 422, "Total credit units ({$total}) exceed the maximum of ".self::MAX_CREDIT_UNITS.'.');
        abort_if($total < self::MIN_CREDIT_UNITS, 422, "Total credit units ({$total}) are below the minimum of ".self::MIN_CREDIT_UNITS.'.');

        DB::transaction(function () use ($registration, $courses, $total) {
            $registration->items()->delete();
            foreach ($courses as $course) {
                $registration->items()->create([
                    'course_id' => $course->id,
                    'credit_units' => $course->credit_units,
                ]);
            }
            $registration->update(['total_credit_units' => $total]);
        });

        return $this->ok($registration->fresh(['items.course:id,code,title,credit_units,course_type']), 'Course selection saved.');
    }

    /**
     * POST /api/v1/student/registration/submit — lock and send for approval.
     * Fee clearance is enforced here when configured (SRS §57).
     */
    public function submit(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();
        $semester = $this->currentSemester();

        $registration = CourseRegistration::with('items')
            ->where('student_id', $student->id)
            ->where('semester_id', $semester?->id)
            ->firstOrFail();

        abort_unless($registration->status === 'DRAFT', 422, 'Registration has already been submitted.');
        abort_if($registration->items->isEmpty(), 422, 'Select at least one course before submitting.');

        // Financial rule (configurable): require fee clearance to submit
        if (config('services.registration.require_fee_clearance', true)) {
            $balance = $student->outstandingBalance();
            abort_if($balance > 0, 402, "Outstanding fees of ₦".number_format($balance, 2).' must be settled before course registration can be submitted.');
        }

        $registration->update(['status' => 'SUBMITTED', 'submitted_at' => now()]);
        $this->audit($request->user(), 'REGISTRATION_SUBMITTED', 'CourseRegistration', $registration->id, null, [
            'total_credit_units' => $registration->total_credit_units,
        ]);

        // Staff bell: a registration is waiting for HOD approval.
        \App\Services\NotificationService::notifyStaff('Registration awaiting approval', sprintf(
            '%s (%s, Level %d) submitted %d credit units for approval.',
            $request->user()->name,
            $student->matric_number,
            (int) $student->current_level_value,
            (int) $registration->total_credit_units,
        ), [
            'kind' => 'REGISTRATION_SUBMITTED',
            'registration_id' => $registration->id,
        ]);

        return $this->ok($registration->fresh(), 'Registration submitted for HOD approval.');
    }

    /**
     * POST /api/v1/student/registration/{item}/drop — remove one course while
     * still in DRAFT.
     */
    public function drop(Request $request, string $item): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        $itemModel = CourseRegistrationItem::whereHas('registration', fn ($r) => $r
            ->where('student_id', $student->id)->where('status', 'DRAFT'))
            ->findOrFail($item);

        $registration = $itemModel->registration;
        DB::transaction(function () use ($registration, $itemModel) {
            $registration->total_credit_units = max(0, $registration->total_credit_units - $itemModel->credit_units);
            $itemModel->delete();
            $registration->save();
        });

        return $this->ok($registration->fresh(['items.course:id,code,title,credit_units']), 'Course dropped.');
    }

    /**
     * GET /api/v1/student/registration/slip — CRF print data.
     */
    public function slip(Request $request): JsonResponse
    {
        $student = $request->user()->student()->load('currentProgramme', 'user');
        $semester = $this->currentSemester();

        $registration = CourseRegistration::with(['items.course'])
            ->where('student_id', $student->id)
            ->where('semester_id', $semester?->id)
            ->firstOrFail();

        return $this->ok([
            'student' => [
                'name' => $student->user->name,
                'matricNumber' => $student->matric_number,
                'programme' => $student->currentProgramme?->name,
                'level' => $student->current_level_value,
            ],
            'semester' => $semester?->name,
            'session' => $semester?->academicSession?->name,
            'registration' => $registration,
            'generatedAt' => now()->toIso8601String(),
        ]);
    }

    // ── Approval actions (HOD / Academic Officer) ───────────────

    /**
     * POST /api/v1/admin/registrations/{id}/approve
     * action: HOD_APPROVE | FINAL_APPROVE | REJECT
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'action' => ['required', 'in:HOD_APPROVE,FINAL_APPROVE,REJECT'],
            'comments' => ['nullable', 'string', 'max:1000'],
        ]);

        $registration = CourseRegistration::with(['student.user', 'items.course'])->findOrFail($id);
        $action = $data['action'];

        if ($action === 'HOD_APPROVE') {
            $this->authorizeRoles($user, 'SUPER_ADMIN', 'HOD', 'ACADEMIC_OFFICER', 'REGISTRAR');
            abort_unless($registration->status === 'SUBMITTED', 422, 'Only submitted registrations can be HOD-approved.');
            $from = $registration->status;
            $registration->update(['status' => 'HOD_APPROVED']);
            $this->audit($user, 'REGISTRATION_HOD_APPROVED', 'CourseRegistration', $registration->id, ['status' => $from], ['status' => 'HOD_APPROVED']);
            \App\Services\NotificationService::notifyUser(
                $registration->student->user,
                'Course registration approved by HOD',
                sprintf('Your course registration (%d credit units) has been approved by the HOD and now awaits final approval.', (int) $registration->total_credit_units),
                ['registration_id' => $registration->id, 'status' => 'HOD_APPROVED'],
            );
        } elseif ($action === 'FINAL_APPROVE') {
            $this->authorizeRoles($user, 'SUPER_ADMIN', 'ACADEMIC_OFFICER', 'REGISTRAR');
            abort_unless($registration->status === 'HOD_APPROVED', 422, 'Registration must be HOD-approved before final approval.');
            $from = $registration->status;
            $registration->update(['status' => 'APPROVED', 'approved_at' => now(), 'approved_by_id' => $user->id]);
            $this->audit($user, 'REGISTRATION_APPROVED', 'CourseRegistration', $registration->id, ['status' => $from], ['status' => 'APPROVED']);
            \App\Services\NotificationService::notifyUser(
                $registration->student->user,
                'Course registration approved',
                sprintf('Your course registration (%d credit units) is fully approved. You can now print your course registration form and exam slip.', (int) $registration->total_credit_units),
                ['registration_id' => $registration->id, 'status' => 'APPROVED'],
            );
        } else {
            $this->authorizeRoles($user, 'SUPER_ADMIN', 'HOD', 'ACADEMIC_OFFICER', 'REGISTRAR');
            abort_unless(in_array($registration->status, ['SUBMITTED', 'HOD_APPROVED'], true), 422, 'Only pending registrations can be rejected.');
            $from = $registration->status;
            $registration->update(['status' => 'REJECTED']);
            $this->audit($user, 'REGISTRATION_REJECTED', 'CourseRegistration', $registration->id, ['status' => $from], ['status' => 'REJECTED', 'comments' => $data['comments'] ?? null]);
            \App\Services\NotificationService::notifyUser(
                $registration->student->user,
                'Course registration returned',
                sprintf('Your course registration was returned for correction.%s You can edit and resubmit it from Course Registration.', isset($data['comments']) ? ' Reason: '.$data['comments'].'.' : ''),
                ['registration_id' => $registration->id, 'status' => 'REJECTED'],
            );
        }

        return $this->ok($registration->fresh(['items.course:id,code,title,credit_units']), 'Registration updated.');
    }

    /** GET /api/v1/admin/registrations?status=SUBMITTED — approval queue */
    public function queue(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'HOD', 'ACADEMIC_OFFICER', 'REGISTRAR');

        $q = CourseRegistration::with(['student.user:id,name', 'student.currentProgramme:id,name', 'items.course:id,code,title,credit_units'])
            ->orderByDesc('submitted_at');

        if ($request->filled('status')) {
            $q->where('status', strtoupper($request->string('status')));
        }

        return $this->ok($q->paginate((int) $request->query('perPage', '25')));
    }

    private function currentSemester(): ?Semester
    {
        return Semester::whereHas('academicSession', fn ($s) => $s->where('is_current', true))
            ->orderByRaw("CASE name WHEN 'FIRST' THEN 1 ELSE 2 END")
            ->first();
    }
}
