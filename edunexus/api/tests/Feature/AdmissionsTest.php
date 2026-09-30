<?php

use App\Models\Admission;
use App\Models\Application;
use App\Models\ApplicationDocument;
use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\OlevelResult;
use App\Models\OlevelSubject;
use App\Models\Student;
use App\Services\AdmissionService;
use App\Services\IncompleteApplicationNudger;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;

uses(Illuminate\Foundation\Testing\RefreshDatabase::class);

it('creates an application and blocks duplicates for the same programme/session', function () {
    [$session] = seedAdmissionWindow();
    $programme = seedProgramme();
    [, $token] = makeApplicant();

    $this->withToken($token)->postJson('/api/v1/applicant/applications', [
        'academicSessionId' => $session->id, 'programmeId' => $programme->id,
        'applicationType' => 'NCE', 'studyMode' => 'FULL_TIME',
    ])->assertStatus(201);

    $this->withToken($token)->postJson('/api/v1/applicant/applications', [
        'academicSessionId' => $session->id, 'programmeId' => $programme->id,
        'applicationType' => 'NCE', 'studyMode' => 'FULL_TIME',
    ])->assertStatus(422);
});

it('rejects application types not allowed by the admission window', function () {
    [$session, $setting] = seedAdmissionWindow();
    $setting->update(['allowed_types' => ['NCE']]);

    $programme = seedProgramme();
    [, $token] = makeApplicant();

    $this->withToken($token)->postJson('/api/v1/applicant/applications', [
        'academicSessionId' => $session->id, 'programmeId' => $programme->id,
        'applicationType' => 'UTME',
    ])->assertStatus(422);
});

it('blocks submission before payment', function () {
    [$session] = seedAdmissionWindow();
    $programme = seedProgramme();
    [, $token] = makeApplicant();

    $res = $this->withToken($token)->postJson('/api/v1/applicant/applications', [
        'academicSessionId' => $session->id, 'programmeId' => $programme->id,
        'applicationType' => 'NCE',
    ])->assertStatus(201);

    $id = $res->json('data.id');

    $this->withToken($token)->postJson("/api/v1/applicant/applications/{$id}/submit")
        ->assertStatus(422);
});

it('walks the full state machine: SUBMITTED → UNDER_REVIEW → SHORTLISTED → ADMITTED', function () {
    [$application, $user, $token] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    expect($application->fresh()->status)->toBe('SUBMITTED');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", [
        'action' => 'REVIEW', 'comments' => 'Docs verified',
    ])->assertOk();
    expect($application->fresh()->status)->toBe('UNDER_REVIEW');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", [
        'action' => 'SHORTLIST',
    ])->assertOk();
    expect($application->fresh()->status)->toBe('SHORTLISTED');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", [
        'action' => 'ADMIT',
    ])->assertOk();
    expect($application->fresh()->status)->toBe('ADMITTED');

    // Admission record created
    $admission = Admission::where('application_id', $application->id)->first();
    expect($admission)->not->toBeNull()
        ->and($admission->status)->toBe('OFFERED')
        ->and($admission->admission_number)->toStartWith('ADM/');
});

it('cannot action a non-reviewable application', function () {
    [$session] = seedAdmissionWindow();
    $programme = seedProgramme();
    [, $token] = makeApplicant();

    $res = $this->withToken($token)->postJson('/api/v1/applicant/applications', [
        'academicSessionId' => $session->id, 'programmeId' => $programme->id,
        'applicationType' => 'NCE',
    ]);
    $id = $res->json('data.id');

    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');
    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$id}/actions", [
        'action' => 'REVIEW',
    ])->assertStatus(422);
});

it('rejects invalid transitions (REJECT → ADMIT)', function () {
    [$application] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", [
        'action' => 'REJECT',
    ])->assertOk();
    expect($application->fresh()->status)->toBe('REJECTED');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", [
        'action' => 'ADMIT',
    ])->assertStatus(422);
});

it('converts an accepted admission into a student with matric number — exactly once', function () {
    [$application, $user, $token] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", ['action' => 'ADMIT'])->assertOk();

    $res = $this->withToken($token)->getJson('/api/v1/applicant/admission-status')->assertOk();
    $admissionId = $res->json('data.0.admission.admissionNumber') !== null
        ? Admission::where('application_id', $application->id)->value('id')
        : null;

    $accept = $this->withToken($token)->postJson("/api/v1/applicant/admissions/{$admissionId}/accept")->assertOk();
    $matric = $accept->json('data.student.matric_number') ?? $accept->json('data.student.matricNumber');
    expect($matric)->toStartWith('EDU/');

    // Idempotent: second accept does not duplicate
    $this->withToken($token)->postJson("/api/v1/applicant/admissions/{$admissionId}/accept")->assertOk();
    expect(Student::where('admission_id', $admissionId)->count())->toBe(1)
        ->and(Student::count())->toBe(1);

    // STUDENT role granted
    expect($user->fresh()->hasRole('STUDENT'))->toBeTrue();
});

it('requires registrar+ to revoke an admission', function () {
    [$application] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');
    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", ['action' => 'ADMIT'])->assertOk();
    $admissionId = Admission::where('application_id', $application->id)->value('id');

    $this->withToken($adminToken)->postJson("/api/v1/admin/admissions/{$admissionId}/revoke")->assertStatus(403);

    [, $registrarToken] = makeStaff('REGISTRAR');
    $this->withToken($registrarToken)->postJson("/api/v1/admin/admissions/{$admissionId}/revoke")->assertOk();
});

it('writes an audit log entry for admission approval', function () {
    [$application] = makePaidApplication();
    [$adminUser, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$application->id}/actions", ['action' => 'ADMIT'])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $adminUser->id,
        'action' => 'ADMISSION_APPROVED',
        'entity_type' => 'Admission',
    ]);
});

it('lets an officer verify and reject application documents', function () {
    [$application] = makePaidApplication();
    [$adminUser, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $doc = ApplicationDocument::create([
        'application_id' => $application->id,
        'document_type' => 'PASSPORT',
        'original_file_name' => 'passport.png',
        'stored_file_name' => 'test-passport.png',
        'storage_path' => 'documents/test-passport.png',
        'mime_type' => 'image/png',
        'file_size' => 1024,
        'version' => 1,
        'verification_status' => 'PENDING',
        'uploaded_at' => now(),
    ]);

    $res = $this->withToken($adminToken)->postJson(
        "/api/v1/admin/applications/{$application->id}/documents/{$doc->id}/verify",
        ['decision' => 'VERIFIED', 'note' => 'Originals sighted']
    )->assertOk();

    expect($res->json('data.verification_status'))->toBe('VERIFIED')
        ->and($res->json('data.verified_by_id'))->toBe($adminUser->id)
        ->and($doc->fresh()->verified_at)->not->toBeNull();

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $adminUser->id,
        'action' => 'DOCUMENT_VERIFIED',
        'entity_type' => 'ApplicationDocument',
        'entity_id' => $doc->id,
    ]);

    $res = $this->withToken($adminToken)->postJson(
        "/api/v1/admin/applications/{$application->id}/documents/{$doc->id}/verify",
        ['decision' => 'REJECTED', 'note' => 'Blurry scan']
    )->assertOk();
    expect($res->json('data.verification_status'))->toBe('REJECTED');

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $adminUser->id,
        'action' => 'DOCUMENT_REJECTED',
        'entity_type' => 'ApplicationDocument',
    ]);
});

it('rejects an invalid verify decision', function () {
    [$application] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $doc = ApplicationDocument::create([
        'application_id' => $application->id,
        'document_type' => 'OLEVEL_RESULT',
        'stored_file_name' => 'waec.png',
        'storage_path' => 'documents/waec.png',
        'mime_type' => 'image/png',
        'version' => 1,
        'verification_status' => 'PENDING',
        'uploaded_at' => now(),
    ]);

    $this->withToken($adminToken)->postJson(
        "/api/v1/admin/applications/{$application->id}/documents/{$doc->id}/verify",
        ['decision' => 'MAYBE']
    )->assertStatus(422);
});

it('blocks applicants from verifying documents', function () {
    [$application, , $token] = makePaidApplication();

    $doc = ApplicationDocument::create([
        'application_id' => $application->id,
        'document_type' => 'PASSPORT',
        'stored_file_name' => 'p.png',
        'storage_path' => 'documents/p.png',
        'mime_type' => 'image/png',
        'version' => 1,
        'verification_status' => 'PENDING',
        'uploaded_at' => now(),
    ]);

    $this->withToken($token)->postJson(
        "/api/v1/admin/applications/{$application->id}/documents/{$doc->id}/verify",
        ['decision' => 'VERIFIED']
    )->assertStatus(403);
});

it('bulk-admits selected shortlisted applications and skips non-reviewable ones', function () {
    [$a1] = makePaidApplication();
    [$a2] = makePaidApplication();
    [$a3] = makePaidApplication();
    [$adminUser, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    // Walk a1 and a2 to SHORTLISTED; a3 is REJECTED to exercise the skip path.
    foreach (['REVIEW', 'SHORTLIST'] as $step) {
        $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$a1->id}/actions", ['action' => $step])->assertOk();
    }
    foreach (['REVIEW', 'SHORTLIST'] as $step) {
        $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$a2->id}/actions", ['action' => $step])->assertOk();
    }
    $this->withToken($adminToken)->postJson("/api/v1/admin/applications/{$a3->id}/actions", [
        'action' => 'REJECT', 'comments' => 'Not eligible.',
    ])->assertOk();

    $res = $this->withToken($adminToken)->postJson('/api/v1/admin/applications/bulk-admit', [
        'applicationIds' => [$a1->id, $a2->id, $a3->id],
        'comments' => 'Batch offer — subject to credential verification.',
    ])->assertOk();

    expect($res->json('data.admitted'))->toHaveCount(2)
        ->and($res->json('data.skipped'))->toHaveCount(1)
        ->and($a1->fresh()->status)->toBe('ADMITTED')
        ->and($a2->fresh()->status)->toBe('ADMITTED')
        ->and($a3->fresh()->status)->toBe('REJECTED')
        ->and($a1->fresh()->decision_comments)->toBe('Batch offer — subject to credential verification.');

    expect(Admission::where('application_id', $a1->id)->exists())->toBeTrue()
        ->and(Admission::where('application_id', $a2->id)->exists())->toBeTrue()
        ->and(Admission::where('application_id', $a3->id)->exists())->toBeFalse();

    // Per-application audit entries, flagged as bulk.
    $bulkAudits = AuditLog::where('user_id', $adminUser->id)
        ->where('action', 'ADMISSION_APPROVED')
        ->whereJsonContains('new_values->bulk', true)
        ->get();
    expect($bulkAudits)->toHaveCount(2);
});

it('validates the bulk-admit payload and caps it at 50', function () {
    [$application] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($adminToken)->postJson('/api/v1/admin/applications/bulk-admit', [
        'applicationIds' => [],
    ])->assertStatus(422);

    $this->withToken($adminToken)->postJson('/api/v1/admin/applications/bulk-admit', [
        'applicationIds' => array_fill(0, 51, (string) Str::uuid()),
    ])->assertStatus(422);

    $this->withToken($adminToken)->postJson('/api/v1/admin/applications/bulk-admit', [
        'applicationIds' => [(string) Str::uuid()],
    ])->assertStatus(404);
});

it('reports per-section completeness for the applicant wizard', function () {
    [$application, $user, $token] = makePaidApplication();

    // Fresh paid application: payment complete, everything else missing.
    $res = $this->withToken($token)->getJson("/api/v1/applicant/applications/{$application->id}/completeness")->assertOk();

    $sections = collect($res->json('data.sections'))->keyBy('key');
    expect($res->json('data.ready'))->toBeFalse()
        ->and($sections['payment']['complete'])->toBeTrue()
        ->and($sections['personal']['complete'])->toBeFalse()
        ->and($sections['personal']['missing'])->toContain('Date of birth')
        ->and($sections['contact']['complete'])->toBeFalse()
        ->and($sections['olevel']['complete'])->toBeFalse()
        ->and($sections['documents']['complete'])->toBeFalse()
        // NCE application: JAMB + qualifications sections exist but are not required.
        ->and($sections['jamb']['complete'])->toBeTrue()
        ->and($sections['qualifications']['complete'])->toBeTrue()
        ->and($res->json('data.problems'))->not->toBeEmpty();

    // Fill personal + contact + O'Level + required docs → all green, ready.
    // (makePaidApplication() creates it SUBMITTED; reopen for editing first.)
    $application->update(['status' => 'PAID', 'submitted_at' => null]);
    $this->withToken($token)->patchJson("/api/v1/applicant/applications/{$application->id}", [
        'personal' => [
            'surname' => 'Test', 'firstName' => 'Applicant', 'dateOfBirth' => '2004-05-10',
            'gender' => 'MALE', 'nationality' => 'Nigerian', 'stateOfOrigin' => 'Kano',
            'address' => '12 Zoo Road, Kano', 'phone' => '08012345678',
        ],
        'contact' => [
            'permanentAddress' => '12 Zoo Road', 'currentAddress' => '12 Zoo Road',
            'emergencyContactName' => 'Baba', 'emergencyContactPhone' => '08087654321',
        ],
        'olevel' => [
            'examinationType' => 'WAEC', 'examinationNumber' => 'WP123456',
            'examinationYear' => 2024, 'sittingNumber' => 1,
            'subjects' => [
                ['subject' => 'English Language', 'grade' => 'C4'],
                ['subject' => 'Mathematics', 'grade' => 'B2'],
            ],
        ],
    ])->assertOk();

    ApplicationDocument::create([
        'application_id' => $application->id,
        'document_type' => 'PASSPORT', 'original_file_name' => 'passport.png',
        'stored_file_name' => 'passport.png', 'storage_path' => 'documents/passport.png',
        'mime_type' => 'image/png', 'file_size' => 1024, 'version' => 1,
        'verification_status' => 'PENDING',
    ]);
    ApplicationDocument::create([
        'application_id' => $application->id,
        'document_type' => 'OLEVEL_RESULT', 'original_file_name' => 'olevel.png',
        'stored_file_name' => 'olevel.png', 'storage_path' => 'documents/olevel.png',
        'mime_type' => 'image/png', 'file_size' => 1024, 'version' => 1,
        'verification_status' => 'PENDING',
    ]);

    $res2 = $this->withToken($token)->getJson("/api/v1/applicant/applications/{$application->id}/completeness")->assertOk();
    expect($res2->json('data.ready'))->toBeTrue()
        ->and($res2->json('data.problems'))->toBeEmpty()
        ->and(collect($res2->json('data.sections'))->every(fn ($s) => $s['complete'] === true))->toBeTrue();
});

it('flags JAMB and qualifications only for the matching application types', function () {
    // UTME application → JAMB section required.
    [$utme, , $utmeToken] = makePaidApplication();
    $utme->update(['application_type' => 'UTME']);

    $res = $this->withToken($utmeToken)->getJson("/api/v1/applicant/applications/{$utme->id}/completeness")->assertOk();
    $utmeSections = collect($res->json('data.sections'))->keyBy('key');
    expect($utmeSections['jamb']['complete'])->toBeFalse()
        ->and($utmeSections['jamb']['missing'])->not->toBeEmpty()
        ->and($utmeSections['qualifications']['complete'])->toBeTrue();

    // DIRECT_ENTRY application → qualifications section required instead.
    [$de, , $deToken] = makePaidApplication();
    $de->update(['application_type' => 'DIRECT_ENTRY']);

    $resDe = $this->withToken($deToken)->getJson("/api/v1/applicant/applications/{$de->id}/completeness")->assertOk();
    $deSections = collect($resDe->json('data.sections'))->keyBy('key');
    expect($deSections['qualifications']['complete'])->toBeFalse()
        ->and($deSections['jamb']['complete'])->toBeTrue();
});

it('exposes completeness to admins but blocks other applicants', function () {
    [$application, , $token] = makePaidApplication();
    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($adminToken)->getJson("/api/v1/admin/applications/{$application->id}/completeness")->assertOk();

    // A different applicant must not read someone else's completeness.
    [, $otherToken] = makeApplicant();
    $this->withToken($otherToken)->getJson("/api/v1/applicant/applications/{$application->id}/completeness")->assertStatus(403);
    $this->withToken($token)->getJson("/api/v1/applicant/applications/{$application->id}/completeness")->assertOk();
});

it('filters the admin queue by submission readiness', function () {
    // a1 incomplete (no payment/docs), a2 fully ready.
    [$a1] = makePaidApplication();
    $a1->update(['status' => 'PAID', 'submitted_at' => null]);
    $a1->payments()->delete();
    [$a2, , $a2Token] = makePaidApplication();
    $a2->update(['status' => 'PAID', 'submitted_at' => null]);
    $this->withToken($a2Token)->patchJson("/api/v1/applicant/applications/{$a2->id}", [
        'personal' => ['surname' => 'Ready', 'firstName' => 'App', 'dateOfBirth' => '2004-01-01', 'gender' => 'FEMALE', 'nationality' => 'Nigerian', 'stateOfOrigin' => 'Kano', 'address' => '1 Road', 'phone' => '08099999999'],
        'contact' => ['permanentAddress' => '1 Road', 'currentAddress' => '1 Road', 'emergencyContactName' => 'Ma', 'emergencyContactPhone' => '08088888888'],
        'olevel' => ['examinationType' => 'WAEC', 'examinationNumber' => 'WP1', 'examinationYear' => 2024, 'sittingNumber' => 1, 'subjects' => [['subject' => 'English Language', 'grade' => 'C4']]],
    ])->assertOk();
    foreach (['PASSPORT', 'OLEVEL_RESULT'] as $type) {
        ApplicationDocument::create([
            'application_id' => $a2->id, 'document_type' => $type,
            'original_file_name' => "{$type}.png", 'stored_file_name' => "{$type}.png",
            'storage_path' => "documents/{$type}.png", 'mime_type' => 'image/png',
            'file_size' => 1024, 'version' => 1, 'verification_status' => 'PENDING',
        ]);
    }

    [, $adminToken] = makeStaff('ADMISSIONS_OFFICER');

    $incomplete = $this->withToken($adminToken)->getJson('/api/v1/admin/applications?readiness=incomplete')->assertOk();
    $ids = collect($incomplete->json('data.data'))->pluck('id');
    expect($ids)->toContain($a1->id)->not->toContain($a2->id);

    // No readiness filter → both visible.
    $all = $this->withToken($adminToken)->getJson('/api/v1/admin/applications')->assertOk();
    $allIds = collect($all->json('data.data'))->pluck('id');
    expect($allIds)->toContain($a1->id)->toContain($a2->id);
});

it('nudges incomplete applications with dedupe and lists missing fields', function () {
    Mail::fake();

    [$application, $user] = makePaidApplication();
    $application->update(['status' => 'PAID', 'submitted_at' => null]);
    // created_at is guarded from mass assignment — set it directly.
    $application->created_at = now()->subDays(8);
    $application->save();
    $application->payments()->delete();

    $nudger = app(IncompleteApplicationNudger::class);

    // First run: nudge fires (crosses the 7-day threshold).
    $r1 = $nudger->nudge();
    expect($r1['notified'])->toBe(1)
        ->and($r1['details'][0]['email'])->toBe($user->email)
        ->and($r1['details'][0]['threshold'])->toBe(7)
        ->and($r1['details'][0]['missing'])->not->toBeEmpty();

    // Second run: identical state → deduped.
    $r2 = $nudger->nudge();
    expect($r2['notified'])->toBe(0);

    // Applicant fixes O'Level → the missing list changes → new nudge fires.
    OlevelResult::create([
        'application_id' => $application->id, 'examination_type' => 'WAEC',
        'examination_number' => 'WP1', 'examination_year' => 2024, 'sitting_number' => 1,
    ]);
    OlevelSubject::create([
        'olevel_result_id' => OlevelResult::where('application_id', $application->id)->first()->id,
        'subject' => 'English Language', 'grade' => 'C4',
    ]);
    $r3 = $nudger->nudge();
    expect($r3['notified'])->toBe(1)
        // The "O'Level results" section is resolved (the OLEVEL_RESULT
        // *document* row may legitimately remain — it was never uploaded).
        ->and(collect($r3['details'][0]['missing'])->every(fn ($m) => ! str_starts_with($m, "O'Level results:")))->toBeTrue();

    // Portal trail: two EMAIL notifications with meta.application_id.
    expect(Notification::where('user_id', $user->id)->where('channel', 'EMAIL')->count())->toBe(2)
        ->and(Notification::whereJsonContains('meta->application_id', $application->id)->count())->toBe(2);

    // Submitted applications are never nudged.
    $application->update(['status' => 'SUBMITTED', 'submitted_at' => now()]);
    $r4 = $nudger->nudge();
    expect($r4['notified'])->toBe(0);

    Mail::assertSentCount(0); // test env uses the log/queue-safe path assertions via notifications table
});
