<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Services\AdmissionService;
use App\Services\ApplicationCompletenessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ApplicationAdminController extends Controller
{
    public function __construct(
        private AdmissionService $admissions,
        private ApplicationCompletenessService $completeness,
    ) {
    }

    /**
     * GET /api/v1/admin/applications — filterable queue (SRS §17).
     * Filters: session, programme, type, status, state, gender, q, readiness
     * (readiness=incomplete → only applications missing submission requirements).
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $q = Application::with(['applicant', 'programme.department', 'academicSession'])
            ->orderByDesc('submitted_at')
            ->orderByDesc('created_at');

        if (strtoupper((string) $request->input('readiness')) === 'INCOMPLETE') {
            $q->incomplete();
        }

        if ($request->filled('status')) {
            $q->where('status', $request->string('status')->upper());
        }
        if ($request->filled('type')) {
            $q->where('application_type', $request->string('type')->upper());
        }
        if ($request->filled('sessionId')) {
            $q->where('academic_session_id', $request->string('sessionId'));
        }
        if ($request->filled('programmeId')) {
            $q->where('programme_id', $request->string('programmeId'));
        }
        if ($request->filled('state')) {
            $q->whereHas('applicant', fn ($a) => $a->where('state_of_origin', $request->string('state')));
        }
        if ($request->filled('gender')) {
            $q->whereHas('applicant', fn ($a) => $a->where('gender', $request->string('gender')->upper()));
        }
        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';
            $q->where(function ($w) use ($term) {
                $w->where('application_number', 'like', $term)
                    ->orWhereHas('applicant', fn ($a) => $a->where(fn ($b) => $b
                        ->where('surname', 'like', $term)
                        ->orWhere('first_name', 'like', $term)
                        ->orWhere('application_number', 'like', $term)));
            });
        }

        return $this->ok($q->paginate((int) $request->query('perPage', '25')));
    }

    /** GET /api/v1/admin/applications/{id} — full review dossier (SRS §18) */
    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $application = Application::with([
            'applicant.user', 'programme.department.faculty', 'academicSession',
            'documents', 'jambResult.subjects', 'olevelResults.subjects',
            'qualifications', 'payments', 'admission',
        ])->findOrFail($id);

        return $this->ok($application);
    }

    /**
     * GET /api/v1/admin/applications/{id}/documents/{docId}/download
     * Officer-side document viewer stream. Files live on the private disk, so
     * this is the only way reviewers can inspect credentials; every view is
     * audited against the application.
     */
    public function downloadDocument(Request $request, string $id, string $docId): \Symfony\Component\HttpFoundation\Response
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $application = Application::findOrFail($id);
        $doc = \App\Models\ApplicationDocument::where('application_id', $id)->findOrFail($docId);
        abort_unless(\Illuminate\Support\Facades\Storage::disk('private')->exists($doc->storage_path), 404, 'File missing.');

        $this->audit($user, 'DOCUMENT_VIEWED', 'ApplicationDocument', $doc->id, null, [
            'application_id' => $application->id,
            'document_type' => $doc->document_type,
            'version' => $doc->version,
        ]);

        $disk = \Illuminate\Support\Facades\Storage::disk('private');
        $name = $doc->original_file_name ?: $doc->stored_file_name;

        // Inline for in-browser preview, with a safe fallback name for downloads.
        return response($disk->get($doc->storage_path), 200, [
            'Content-Type' => $doc->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="'.$name.'"',
            'Content-Length' => (string) $disk->size($doc->storage_path),
            'Cache-Control' => 'private, no-store',
        ]);
    }

    /**
     * POST /api/v1/admin/applications/{id}/documents/{docId}/verify
     * Officer credential check: mark a document VERIFIED or REJECTED (SRS §18).
     * The reviewed file is always re-streamed for the audit trail.
     */
    public function verifyDocument(Request $request, string $id, string $docId): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $data = $request->validate([
            'decision' => ['required', Rule::in(['VERIFIED', 'REJECTED'])],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $application = Application::findOrFail($id);
        $doc = \App\Models\ApplicationDocument::where('application_id', $id)->findOrFail($docId);

        $previous = $doc->verification_status;
        $doc->update([
            'verification_status' => $data['decision'],
            'verified_by_id' => $user->id,
            'verified_at' => now(),
        ]);

        $this->audit($user, 'DOCUMENT_'.($data['decision'] === 'VERIFIED' ? 'VERIFIED' : 'REJECTED'),
            'ApplicationDocument', $doc->id,
            ['verification_status' => $previous, 'version' => $doc->version],
            [
                'verification_status' => $data['decision'],
                'application_id' => $application->id,
                'document_type' => $doc->document_type,
                'note' => $data['note'] ?? null,
            ]);        return $this->ok($doc->fresh(), 'Document marked '.$data['decision'].'.');
    }

    /**
     * POST /api/v1/admin/applications/bulk-admit
     * Admit up to 50 shortlisted applications in one transaction. Every admit
     * keeps its own audit entry; each row that has become non-reviewable since
     * selection is skipped and reported instead of failing the batch.
     */
    public function bulkAdmit(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $data = $request->validate([
            'applicationIds' => ['required', 'array', 'min:1', 'max:50'],
            'applicationIds.*' => ['required', 'uuid'],
            'comments' => ['nullable', 'string', 'max:2000'],
        ]);

        $applications = Application::whereIn('id', $data['applicationIds'])
            ->orderByDesc('submitted_at')
            ->get();

        if ($applications->count() < count($data['applicationIds'])) {
            abort(404, 'One or more selected applications were not found.');
        }

        $admitted = [];
        $skipped = [];

        \Illuminate\Support\Facades\DB::beginTransaction();
        try {
            foreach ($applications as $application) {
                if (! $application->isReviewable()) {
                    $skipped[] = ['id' => $application->id, 'reason' => 'Status is '.$application->status.'.'];
                    continue;
                }

                $admission = $this->admissions->admit($application, $user->id);
                if (! empty($data['comments'])) {
                    $application->update(['decision_comments' => $data['comments']]);
                }
                $this->audit($user, 'ADMISSION_APPROVED', 'Admission', $admission->id, null, [
                    'admission_number' => $admission->admission_number,
                    'bulk' => true,
                ]);
                $admitted[] = $admission;
            }
            \Illuminate\Support\Facades\DB::commit();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            throw $e;
        }

        return $this->ok([
            'admitted' => collect($admitted)->map(fn ($a) => [
                'applicationId' => $a->application_id,
                'admissionNumber' => $a->admission_number,
            ])->all(),
            'skipped' => $skipped,
        ], count($skipped) > 0
            ? count($admitted).' admitted, '.count($skipped).' skipped.'
            : count($admitted).' applicant'.(count($admitted) === 1 ? '' : 's').' admitted.');
    }

    /**
     * POST /api/v1/admin/applications/{id}/actions
     * action: REVIEW | SHORTLIST | SCREENING | REQUEST_CORRECTION | REJECT | ADMIT
     */
    public function action(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $data = $request->validate([
            'action' => ['required', Rule::in(['REVIEW', 'SHORTLIST', 'SCREENING', 'REQUEST_CORRECTION', 'REJECT', 'ADMIT'])],
            'comments' => ['nullable', 'string', 'max:2000'],
        ]);

        $application = Application::findOrFail($id);
        abort_unless($application->isReviewable(), 422, 'Only submitted applications can be actioned.');

        $action = $data['action'];
        $comments = $data['comments'] ?? null;

        $transitions = [
            'REVIEW' => ['to' => 'UNDER_REVIEW', 'perm' => 'applications.review'],
            'SHORTLIST' => ['to' => 'SHORTLISTED', 'perm' => 'applications.shortlist'],
            'SCREENING' => ['to' => 'SCREENING', 'perm' => 'applications.screen'],
            'REQUEST_CORRECTION' => ['to' => 'PAID', 'perm' => 'applications.correction-request'],
            'REJECT' => ['to' => 'REJECTED', 'perm' => 'applications.reject'],
        ];

        if ($action === 'ADMIT') {
            $admission = $this->admissions->admit($application, $user->id);
            $this->audit($user, 'ADMISSION_APPROVED', 'Admission', $admission->id, null, [
                'admission_number' => $admission->admission_number,
            ]);

            return $this->ok($admission, 'Applicant admitted.');
        }

        [$transition] = [$transitions[$action]];
        $to = $transition['to'];
        $from = $application->status;

        if ($action === 'REQUEST_CORRECTION') {
            // Reopens the application for editing; comments required
            abort_unless($comments, 422, 'Comments are required when requesting correction.');
        }

        $application->update([
            'status' => $to,
            'reviewed_at' => now(),
            'review_comments' => $comments ?? $application->review_comments,
        ]);

        $this->audit($user, 'APPLICATION_'.$action, 'Application', $application->id,
            ['status' => $from], ['status' => $to, 'comments' => $comments]);

        return $this->ok($application->fresh(), 'Application updated.');
    }

    /**
     * GET /api/v1/admin/applications/{id}/completeness — per-section readiness
     * mirroring the applicant wizard stages; powers the review-page checklist.
     */
    public function completeness(Request $request, string $id): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER');

        $application = Application::findOrFail($id);

        return $this->ok($this->completeness->describe($application));
    }

    /**
     * GET /api/v1/admin/stats — dashboard KPIs (SRS §39).
     */
    public function stats(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER', 'ACADEMIC_OFFICER', 'BURSARY_OFFICER');

        $byStatus = Application::selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return $this->ok([
            'students' => ['total' => \App\Models\Student::count()],
            'applications' => [
                'total' => Application::count(),
                'submitted' => Application::where('status', 'SUBMITTED')->count(),
                'underReview' => Application::whereIn('status', ['UNDER_REVIEW', 'SHORTLISTED', 'SCREENING'])->count(),
                'admitted' => Application::where('status', 'ADMITTED')->count(),
                'rejected' => Application::where('status', 'REJECTED')->count(),
            ],
            'byStatus' => $byStatus,
            'payments' => [
                'successfulCount' => \App\Models\ApplicationPayment::where('status', 'SUCCESSFUL')->count(),
                'revenue' => (float) \App\Models\ApplicationPayment::where('status', 'SUCCESSFUL')->sum('amount'),
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/admissions/{id}/revoke — undo an offer (Registrar+).
     */
    public function revokeAdmission(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $admission = \App\Models\Admission::findOrFail($id);
        abort_unless($admission->status === 'OFFERED', 422, 'Only pending offers can be revoked.');

        $application = $admission->application;
        $admission->update(['status' => 'WITHDRAWN']);
        if ($application) {
            $application->update(['status' => 'SCREENING', 'decision_comments' => 'Admission offer revoked.']);
        }

        $this->audit($user, 'ADMISSION_REVOKED', 'Admission', $admission->id);

        return $this->ok($admission->fresh(), 'Admission offer revoked.');
    }
}
