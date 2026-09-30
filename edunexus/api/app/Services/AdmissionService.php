<?php

namespace App\Services;

use App\Models\Application;
use App\Models\ApplicationSetting;
use App\Models\AcademicSession;
use Illuminate\Support\Facades\DB;

/**
 * AdmissionService — the configurable admission engine (SRS §18/§19/§56).
 * Business rules are data-driven from application_settings, never hard-coded.
 */
class AdmissionService
{
    /**
     * Validate that a new/edited application complies with the active
     * admission window and programme rules.
     */
    public function validateWindow(AcademicSession $session, string $applicationType): void
    {
        $setting = ApplicationSetting::where('academic_session_id', $session->id)->first();

        if (! $setting || ! $setting->applicationOpen()) {
            abort(422, 'The application window for this session is not open.');
        }

        $allowed = $setting->allowed_types;
        if (is_array($allowed) && count($allowed) > 0 && ! in_array($applicationType, $allowed, true)) {
            abort(422, "Application type '{$applicationType}' is not available for this session.");
        }
    }

    /**
     * Check whether an applicant already has an application for the same
     * programme + session (one per programme/session unless configured).
     */
    public function ensureNoDuplicate(string $applicantId, string $sessionId, string $programmeId, ?Application $ignore = null): void
    {
        $q = Application::where('applicant_id', $applicantId)
            ->where('academic_session_id', $sessionId)
            ->where('programme_id', $programmeId)
            ->whereNotIn('status', ['WITHDRAWN', 'REJECTED']);
        if ($ignore) {
            $q->where('id', '!=', $ignore->id);
        }
        if ($q->exists()) {
            abort(422, 'You already have an application for this programme in this session.');
        }
    }

    /**
     * Full submission gate (SRS §57): payment verified + mandatory fields +
     * at least one O'Level result + required documents present.
     */
    public function checkSubmissionReadiness(Application $application): array
    {
        $problems = [];

        if (! $application->hasSuccessfulPayment()) {
            $problems[] = 'Application fee has not been paid.';
        }

        foreach (['permanent_address', 'current_address'] as $field) {
            if (empty($application->{$field})) {
                $problems[] = 'Contact information is incomplete.';
                break;
            }
        }

        if ($application->olevelResults()->count() === 0) {
            $problems[] = "At least one O'Level result is required.";
        }

        $requiredDocs = ['PASSPORT', 'OLEVEL_RESULT'];
        $present = $application->documents()->pluck('document_type')->all();
        foreach ($requiredDocs as $doc) {
            if (! in_array($doc, $present, true)) {
                $problems[] = "Missing required document: {$doc}.";
            }
        }

        if ($application->application_type === 'UTME' && ! $application->jambResult) {
            $problems[] = 'JAMB information is required for UTME applications.';
        }

        if ($application->application_type === 'DIRECT_ENTRY' && $application->qualifications()->count() === 0) {
            $problems[] = 'Direct Entry requires at least one previous qualification.';
        }

        return $problems;
    }

    /**
     * Admit an application: create the Admission record. Student conversion
     * happens on acceptance (convertToStudent).
     */
    public function admit(Application $application, string $admittedBy): \App\Models\Admission
    {
        if (! $application->isReviewable()) {
            abort(422, 'Only submitted applications can be admitted.');
        }

        return DB::transaction(function () use ($application, $admittedBy) {
            $admission = \App\Models\Admission::create([
                'application_id' => $application->id,
                'admission_number' => $this->nextAdmissionNumber(),
                'programme_id' => $application->programme_id,
                'level_value' => $application->entry_level_value ?? 100,
                'academic_session_id' => $application->academic_session_id,
                'status' => 'OFFERED',
            ]);

            $application->update([
                'status' => 'ADMITTED',
                'decided_at' => now(),
                'decision_comments' => 'Admission offered.',
            ]);

            return $admission;
        });
    }

    /**
     * Acceptance → student conversion (SRS §21): one transaction creating the
     * student record, matric number and STUDENT role. Duplicate-proof via
     * unique constraints + existence check.
     */
    public function convertToStudent(\App\Models\Admission $admission): \App\Models\Student
    {
        if ($admission->status !== 'OFFERED') {
            abort(422, 'This admission offer is not in an acceptable state.');
        }

        $existing = \App\Models\Student::where('admission_id', $admission->id)->first();
        if ($existing) {
            return $existing;
        }

        $application = $admission->application()->with('applicant.user')->firstOrFail();

        return DB::transaction(function () use ($admission, $application) {
            $admission->update(['status' => 'ACCEPTED', 'accepted_at' => now()]);

            $user = $application->applicant->user;
            $user->roles()->syncWithoutDetaching([
                \App\Models\Role::where('name', 'STUDENT')->value('id'),
            ]);

            $matric = $this->nextMatricNumber($admission->academic_session_id);

            $student = \App\Models\Student::create([
                'user_id' => $user->id,
                'matric_number' => $matric,
                'applicant_id' => $application->applicant_id,
                'admission_id' => $admission->id,
                'current_programme_id' => $admission->programme_id,
                'current_level_value' => $admission->level_value,
                'status' => 'ACTIVE',
                'entry_type' => $application->application_type === 'DIRECT_ENTRY' ? 'DIRECT_ENTRY' : 'UTME',
                'student_type' => 'FRESH',
                'admission_date' => now()->toDateString(),
            ]);

            \App\Models\StudentProgramme::create([
                'student_id' => $student->id,
                'programme_id' => $admission->programme_id,
                'level_value' => $admission->level_value,
                'academic_session_id' => $admission->academic_session_id,
                'start_date' => now()->toDateString(),
                'status' => 'CURRENT',
            ]);

            // Fee assessment (SRS §21 + AKCILS procedure): the fresh student is
            // billed ACCEPTANCE_FEE + SCHOOL_FEES from the programme's fee structure.
            app(self::class)->assessFees($student, $admission);

            return $student;
        });
    }

    /**
     * Generate the new student's invoices from the session's fee structure:
     * one ACCEPTANCE_FEE invoice + one SCHOOL_FEES invoice. Safe to call twice —
     * invoice_type is unique per student per session by convention.
     */
    public function assessFees(\App\Models\Student $student, \App\Models\Admission $admission): void
    {
        $alreadyBilled = \App\Models\Invoice::where('student_id', $student->id)
            ->where('academic_session_id', $admission->academic_session_id)
            ->exists();
        if ($alreadyBilled) {
            return;
        }

        $structure = \App\Models\FeeStructure::with('items')
            ->where('academic_session_id', $admission->academic_session_id)
            ->where('programme_id', $admission->programme_id)
            ->where('level_value', $admission->level_value)
            ->where('student_type', 'FRESH')
            ->where('is_active', true)
            ->first();

        if (! $structure || $structure->items->isEmpty()) {
            return; // no structure configured yet — bursary can bill manually
        }

        $acceptance = $structure->items->firstWhere('category', 'ACCEPTANCE');
        $tuition = $structure->items->where('category', '!=', 'ACCEPTANCE');

        $bill = function (string $type, float $amount) use ($student, $admission): void {
            if ($amount <= 0) {
                return;
            }
            \App\Models\Invoice::create([
                'invoice_number' => 'INV-'.strtoupper(\Illuminate\Support\Str::random(12)),
                'student_id' => $student->id,
                'invoice_type' => $type,
                'academic_session_id' => $admission->academic_session_id,
                'total_amount' => $amount,
                'amount_paid' => 0,
                'balance' => $amount,
                'status' => 'UNPAID',
                'due_date' => now()->addDays(21)->toDateString(),
            ]);
        };

        $bill('ACCEPTANCE_FEE', (float) ($acceptance?->amount ?? 0));
        $bill('SCHOOL_FEES', (float) $tuition->sum('amount'));
    }

    public function nextAdmissionNumber(): string
    {
        $year = now()->format('Y');
        $count = \App\Models\Admission::count() + 1;

        do {
            $number = sprintf('ADM/%s/%05d', $year, $count);
            $exists = \App\Models\Admission::where('admission_number', $number)->exists();
            if ($exists) $count++;
        } while ($exists);

        return $number;
    }

    public function nextMatricNumber(string $sessionId): string
    {
        $session = AcademicSession::find($sessionId);
        $year = substr((string) ($session?->name ?? now()->format('Y')), 0, 4);
        $count = \App\Models\Student::count() + 1;

        do {
            $number = sprintf('EDU/%s/%05d', $year, $count);
            $exists = \App\Models\Student::where('matric_number', $number)->exists();
            if ($exists) $count++;
        } while ($exists);

        return $number;
    }
}
