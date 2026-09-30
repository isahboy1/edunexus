<?php

namespace App\Http\Controllers\Applicant;

use App\Http\Controllers\Controller;
use App\Models\AcademicSession;
use App\Models\Application;
use App\Models\ApplicationPayment;
use App\Models\ApplicationQualification;
use App\Models\JambResult;
use App\Models\OlevelResult;
use App\Models\OlevelSubject;
use App\Services\AdmissionService;
use App\Services\ApplicationCompletenessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApplicationController extends Controller
{
    public function __construct(
        private AdmissionService $admissions,
        private ApplicationCompletenessService $completeness,
    ) {
    }

    /** GET /api/v1/applicant/applications */
    public function index(Request $request): JsonResponse
    {
        $applications = Application::with([
            'programme.department.faculty', 'academicSession',
            'documents', 'payments', 'olevelResults.subjects', 'admission',
        ])
            ->where('applicant_id', $request->user()->applicant?->id)
            ->orderByDesc('created_at')
            ->get();

        return $this->ok($applications);
    }

    /** POST /api/v1/applicant/applications — start a new application */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Optional: defaults to the current session when omitted (frontend convenience).
            'academicSessionId' => ['nullable', 'uuid', 'exists:academic_sessions,id'],
            'programmeId' => ['required', 'uuid', 'exists:programmes,id'],
            'applicationType' => ['required', 'string'],
            'studyMode' => ['nullable', 'string', 'in:FULL_TIME,PART_TIME,SANDWICH,REMOTE'],
            'entryLevelValue' => ['nullable', 'integer', 'min:100', 'max:400'],
        ]);

        $applicant = $request->user()->applicant;
        abort_unless($applicant, 403, 'Applicant profile required.');

        $session = isset($data['academicSessionId'])
            ? AcademicSession::findOrFail($data['academicSessionId'])
            : AcademicSession::where('is_current', true)->firstOrFail();
        $this->admissions->validateWindow($session, $data['applicationType']);

        // Pick the active session if none given
        if (! $session->is_current) {
            $current = AcademicSession::where('is_current', true)->first();
            if ($current) {
                $this->admissions->validateWindow($current, $data['applicationType']);
                $session = $current;
            }
        }

        $this->admissions->ensureNoDuplicate($applicant->id, $session->id, $data['programmeId']);

        $application = Application::create([
            'application_number' => $applicant->application_number.'-'.($applicant->applications()->count() + 1),
            'applicant_id' => $applicant->id,
            'academic_session_id' => $session->id,
            'programme_id' => $data['programmeId'],
            'application_type' => $data['applicationType'],
            'study_mode' => $data['studyMode'] ?? 'FULL_TIME',
            'entry_level_value' => $data['entryLevelValue'] ?? 100,
            'status' => 'DRAFT',
            'payment_status' => 'PENDING',
        ]);

        $this->audit($request->user(), 'APPLICATION_CREATED', 'Application', $application->id);

        return $this->ok($application->load(['programme.department.faculty', 'academicSession']), 'Application started.', 201);
    }

    /** GET /api/v1/applicant/applications/{id} — full dossier for the wizard */
    public function show(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);

        return $this->ok(
            $application->load([
                'applicant', 'programme.department.faculty', 'academicSession',
                'documents', 'jambResult.subjects',
                'olevelResults.subjects', 'qualifications',
                'payments', 'admission',
            ])
        );
    }

    /**
     * PATCH /api/v1/applicant/applications/{id} — section-wise updates.
     * Body keys: personal, contact, programme, jamb, olevel, qualifications
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);
        abort_unless($application->isEditable(), 422, 'Application can no longer be modified.');

        $data = $request->validate([
            'personal' => ['nullable', 'array'],
            'personal.surname' => ['nullable', 'string', 'max:100'],
            'personal.firstName' => ['nullable', 'string', 'max:100'],
            'personal.middleName' => ['nullable', 'string', 'max:100'],
            'personal.phone' => ['nullable', 'string', 'max:30'],
            'personal.dateOfBirth' => ['nullable', 'date', 'before:today'],
            'personal.gender' => ['nullable', 'in:MALE,FEMALE'],
            'personal.maritalStatus' => ['nullable', 'string', 'max:30'],
            'personal.religion' => ['nullable', 'string', 'max:50'],
            'personal.nationality' => ['nullable', 'string', 'max:100'],
            'personal.stateOfOrigin' => ['nullable', 'string', 'max:100'],
            'personal.lga' => ['nullable', 'string', 'max:100'],
            'personal.address' => ['nullable', 'string', 'max:1000'],
            'contact' => ['nullable', 'array'],
            'programme' => ['nullable', 'array'],
            'jamb' => ['nullable', 'array'],
            'olevel' => ['nullable', 'array'],
            'qualifications' => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($request, $application, $data) {
            // Section A — Personal Information (updates applicant profile too)
            if (! empty($data['personal'])) {
                $p = $data['personal'];
                $profile = $application->applicant;
                $profile->update([
                    'surname' => $p['surname'] ?? $profile->surname,
                    'first_name' => $p['firstName'] ?? $profile->first_name,
                    'middle_name' => $p['middleName'] ?? $profile->middle_name,
                    'date_of_birth' => $p['dateOfBirth'] ?? null,
                    'gender' => $p['gender'] ?? null,
                    'nationality' => $p['nationality'] ?? null,
                    'state_of_origin' => $p['stateOfOrigin'] ?? null,
                    'lga' => $p['lga'] ?? null,
                    'address' => $p['address'] ?? null,
                ]);
                if (! empty($p['phone'])) {
                    $profile->user()->update(['phone' => $p['phone']]);
                }
                $application->update([
                    'marital_status' => $p['maritalStatus'] ?? $application->marital_status,
                    'religion' => $p['religion'] ?? $application->religion,
                ]);
            }

            // Section B — Contact Information
            if (! empty($data['contact'])) {
                $c = $data['contact'];
                $application->update([
                    'permanent_address' => $c['permanentAddress'] ?? $application->permanent_address,
                    'current_address' => $c['currentAddress'] ?? $application->current_address,
                    'emergency_contact_name' => $c['emergencyContactName'] ?? $application->emergency_contact_name,
                    'emergency_contact_phone' => $c['emergencyContactPhone'] ?? $application->emergency_contact_phone,
                    'emergency_contact_address' => $c['emergencyContactAddress'] ?? $application->emergency_contact_address,
                ]);
            }

            // Section C — Programme selection
            if (! empty($data['programme'])) {
                $pg = $data['programme'];
                if (! empty($pg['programmeId']) && $pg['programmeId'] !== $application->programme_id) {
                    $this->admissions->ensureNoDuplicate(
                        $application->applicant_id, $application->academic_session_id,
                        $pg['programmeId'], $application
                    );
                    $application->programme_id = $pg['programmeId'];
                }
                if (! empty($pg['applicationType'])) {
                    $this->admissions->validateWindow($application->academicSession, $pg['applicationType']);
                    $application->application_type = $pg['applicationType'];
                }
                if (! empty($pg['studyMode'])) $application->study_mode = $pg['studyMode'];
                if (array_key_exists('entryLevelValue', $pg) && $pg['entryLevelValue']) {
                    $application->entry_level_value = (int) $pg['entryLevelValue'];
                }
                $application->save();
            }

            // Section D — JAMB
            if (! empty($data['jamb'])) {
                $j = $data['jamb'];
                if (! empty($j['registrationNumber'])) {
                    $jamb = JambResult::updateOrCreate(
                        ['application_id' => $application->id],
                        [
                            'registration_number' => $j['registrationNumber'],
                            'examination_year' => (int) ($j['examinationYear'] ?? now()->format('Y')),
                            'utme_score' => isset($j['utmeScore']) ? (int) $j['utmeScore'] : null,
                            'institution_choice' => $j['institutionChoice'] ?? null,
                        ]
                    );
                    if (! empty($j['subjects']) && is_array($j['subjects'])) {
                        $jamb->subjects()->delete();
                        foreach ($j['subjects'] as $s) {
                            if (! empty($s['subject'])) {
                                $jamb->subjects()->create([
                                    'subject' => $s['subject'],
                                    'score' => (int) ($s['score'] ?? 0),
                                ]);
                            }
                        }
                    }
                }
            }

            // Section E — O'Level (replace-all per sitting)
            if (! empty($data['olevel']) && ! empty($data['olevel']['examinationType'])) {
                $o = $data['olevel'];
                OlevelResult::where('application_id', $application->id)
                    ->where('sitting_number', (int) ($o['sittingNumber'] ?? 1))
                    ->each(fn ($r) => $r->delete());

                $olevel = OlevelResult::create([
                    'application_id' => $application->id,
                    'examination_type' => $o['examinationType'],
                    'examination_number' => $o['examinationNumber'] ?? '',
                    'examination_year' => (int) ($o['examinationYear'] ?? now()->format('Y')),
                    'sitting_number' => (int) ($o['sittingNumber'] ?? 1),
                ]);
                foreach (($o['subjects'] ?? []) as $s) {
                    if (! empty($s['subject'])) {
                        OlevelSubject::create([
                            'olevel_result_id' => $olevel->id,
                            'subject' => $s['subject'],
                            'grade' => $s['grade'] ?? 'F',
                        ]);
                    }
                }
            }

            // Section F — Previous qualifications (Direct Entry)
            if (! empty($data['qualifications']) && is_array($data['qualifications'])) {
                ApplicationQualification::where('application_id', $application->id)->delete();
                foreach ($data['qualifications'] as $q) {
                    if (! empty($q['qualification'])) {
                        ApplicationQualification::create([
                            'application_id' => $application->id,
                            'qualification' => $q['qualification'],
                            'institution' => $q['institution'] ?? '',
                            'certificate' => $q['certificate'] ?? null,
                            'grade_class' => $q['gradeClass'] ?? null,
                            'year' => (int) ($q['year'] ?? now()->format('Y')),
                        ]);
                    }
                }
            }
        });

        return $this->ok($application->fresh()->load(['programme.department.faculty', 'jambResult.subjects', 'olevelResults.subjects', 'qualifications']));
    }

    /**
     * POST /api/v1/applicant/applications/{id}/submit — runs the readiness
     * gate; on success moves the application to SUBMITTED and locks it.
     */
    public function submit(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);
        abort_unless($application->isEditable(), 422, 'Application has already been submitted.');

        $problems = $this->admissions->checkSubmissionReadiness($application);
        if (count($problems) > 0) {
            return response()->json([
                'ok' => false,
                'message' => 'Application is not ready for submission.',
                'data' => ['problems' => $problems],
            ], 422);
        }

        $application->update(['status' => 'SUBMITTED', 'submitted_at' => now()]);
        $this->audit($request->user(), 'APPLICATION_SUBMITTED', 'Application', $application->id);

        return $this->ok($application->fresh(), 'Application submitted successfully.');
    }

    /**
     * POST /api/v1/applicant/applications/{id}/payments — create + initialise
     * the application-fee payment.
     */
    public function initializePayment(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);

        if ($application->hasSuccessfulPayment()) {
            abort(422, 'Application fee has already been paid.');
        }

        // Reuse the in-flight payment (PENDING/PROCESSING): repeated clicks
        // re-issue the same checkout/RRR instead of creating duplicate rows.
        // Only a FAILED payment spawns a fresh attempt.
        $inflight = $application->payments()
            ->whereIn('status', ['PENDING', 'PROCESSING'])
            ->orderByDesc('created_at')
            ->first();

        if ($inflight) {
            $service = app(\App\Services\PaymentService::class);
            $inflight->update([
                'gateway_response' => $service->gatewayFor($inflight->gateway)->initialize($inflight),
            ]);

            return $this->ok($inflight, 'Payment initialised.');
        }

        $payment = app(\App\Services\PaymentService::class)->initializeApplicationPayment($application);
        $this->audit($request->user(), 'PAYMENT_INITIALIZED', 'ApplicationPayment', $payment->id);

        return $this->ok($payment->fresh(), 'Payment initialised.', 201);
    }

    /**
     * GET /api/v1/applicant/applications/{id}/completeness — per-section
     * readiness for the wizard sidebar (missing-field hints) + the same
     * problems array the submit gate enforces.
     */
    public function completeness(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);

        return $this->ok($this->completeness->describe($application));
    }

    /** GET /api/v1/applicant/applications/{id}/slip — acknowledgement slip data */
    public function slip(Request $request, string $id): JsonResponse
    {
        $application = $this->findOwned($request, $id);
        abort_unless(in_array($application->status, ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SCREENING', 'ADMITTED', 'REJECTED'], true), 422, 'Slip is available after submission.');

        $application->load(['applicant.user', 'programme.department.faculty', 'academicSession', 'payments']);

        return $this->ok([
            'application' => $application,
            'generatedAt' => now()->toIso8601String(),
        ]);
    }

    /** GET /api/v1/applicant/admission-status — across all applications */
    public function admissionStatus(Request $request): JsonResponse
    {
        $applications = Application::with(['programme', 'admission', 'academicSession'])
            ->where('applicant_id', $request->user()->applicant?->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'applicationNumber' => $a->application_number,
                'programme' => $a->programme ? [
                    'name' => $a->programme->name,
                    'code' => $a->programme->code,
                    'award' => $a->programme->award,
                ] : null,
                'academicSession' => $a->academicSession ? ['name' => $a->academicSession->name] : null,
                'session' => $a->academicSession?->name,
                'status' => $a->status,
                'paymentStatus' => $a->payment_status,
                'submittedAt' => $a->submitted_at?->toIso8601String(),
                'decisionComments' => $a->decision_comments,
                'admission' => $a->admission ? [
                    'id' => $a->admission->id,
                    'admissionNumber' => $a->admission->admission_number,
                    'status' => $a->admission->status,
                    'level' => $a->admission->level_value,
                    'offeredAt' => $a->admission->offered_at?->toIso8601String(),
                    'acceptedAt' => $a->admission->accepted_at?->toIso8601String(),
                    'offerConditions' => $a->admission->offer_conditions,
                ] : null,
            ]);

        return $this->ok($applications);
    }

    /**
     * POST /api/v1/applicant/admissions/{admissionId}/accept — acceptance
     * triggers the atomic student conversion (matric number + STUDENT role).
     */
    public function acceptAdmission(Request $request, string $admissionId): JsonResponse
    {
        $applicant = $request->user()->applicant;
        abort_unless($applicant, 403, 'Applicant profile required.');

        $admission = \App\Models\Admission::findOrFail($admissionId);
        $admission->load('application');
        abort_unless($admission->application->applicant_id === $applicant->id, 403, 'This admission does not belong to you.');
        abort_unless(in_array($admission->status, ['OFFERED', 'ACCEPTED'], true), 422, 'This admission offer is no longer pending.');

        // Idempotent: an already-accepted admission returns the existing student.
        if ($admission->status === 'ACCEPTED') {
            $existing = \App\Models\Student::where('admission_id', $admission->id)->first();
            abort_unless($existing, 422, 'This admission offer is no longer pending.');

            return $this->ok([
                'admission' => $admission,
                'student' => $existing->load('currentProgramme'),
            ], 'Admission already accepted.');
        }

        $student = $this->admissions->convertToStudent($admission);
        $this->audit($request->user(), 'ADMISSION_ACCEPTED', 'Admission', $admission->id);

        return $this->ok([
            'admission' => $admission->fresh(),
            'student' => $student->load('currentProgramme'),
        ], 'Admission accepted. Welcome!');
    }

    /** Guard: owned, existing application */
    private function findOwned(Request $request, string $id): Application
    {
        $application = Application::findOrFail($id);
        $this->authorizeOwnership($request->user(), $application);

        return $application;
    }
}
