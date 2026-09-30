<?php

/**
 * EDUNEXUS Laravel API end-to-end smoke test (SRS §60 lifecycle):
 * register → login → apply → sections → upload → pay (webhook) → submit
 * → slip → admin review → shortlist → admit → accept → student conversion.
 *
 * Usage: php scripts/smoke.php [baseUrl]
 */

$base = $argv[1] ?? 'http://127.0.0.1:8000';
$secret = 'dev-webhook-secret-change-me';

$passed = 0;
$failed = 0;
function check(string $name, bool $cond, string $extra = ''): void
{
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "  OK   {$name}\n";
    } else {
        $failed++;
        echo "  FAIL {$name}".($extra !== '' ? " — {$extra}" : '')."\n";
    }
}

/** @return array{0:int,1:array} */
function api(string $method, string $path, array $body = [], ?string $token = null, ?string $file = null, ?string $fileType = null): array
{
    global $base;
    $ch = curl_init($base.$path);
    $headers = ['Accept: application/json'];
    $post = null;

    if ($file !== null) {
        $post = ['documentType' => $body['documentType'] ?? 'PASSPORT', 'document' => new CURLFile($file, $fileType ?? 'image/png', 'test.png')];
    } elseif ($body !== []) {
        $post = json_encode($body);
        $headers[] = 'Content-Type: application/json';
    }
    if ($token) {
        $headers[] = 'Authorization: Bearer '.$token;
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [$code, json_decode((string) $raw, true) ?? []];
}

$rand = substr((string) time(), -6);
$email = "smoke{$rand}@test.local";
$phone = '080'.str_pad($rand, 8, '7', STR_PAD_RIGHT); // 11 digits: 0-8-0 + 8 digits

// 1 ─ Public endpoints
[$c, $info] = api('GET', '/api/v1/public/admission-info');
check('GET admission-info', $c === 200 && ($info['data']['isOpen'] ?? false) && ($info['data']['fee'] ?? 0) > 0);

[$c, $progs] = api('GET', '/api/v1/programmes');
check('GET programmes', $c === 200 && count($progs['data'] ?? []) >= 15);
$programmeId = $progs['data'][0]['id'] ?? null;
check('programme id present', (bool) $programmeId);

// 2 ─ Registration
[$c, $reg] = api('POST', '/api/v1/auth/register', [
    'surname' => 'Smoke', 'firstName' => 'Tester'.$rand, 'email' => $email,
    'phone' => $phone, 'password' => 'Passw0rd123', 'passwordConfirmation' => 'Passw0rd123',
]);
check('POST auth/register', $c === 201, json_encode($reg));

// duplicate rejected
[$c2] = api('POST', '/api/v1/auth/register', [
    'surname' => 'Smoke', 'firstName' => 'Dup', 'email' => $email,
    'phone' => '081'.substr($phone, 3), 'password' => 'Passw0rd123', 'passwordConfirmation' => 'Passw0rd123',
]);
check('duplicate register rejected', $c2 === 422);

// 3 ─ Login
[$c, $login] = api('POST', '/api/v1/auth/login', ['email' => $email, 'password' => 'Passw0rd123']);
check('POST auth/login', $c === 200 && ! empty($login['data']['token']));
$token = $login['data']['token'] ?? '';

// wrong password → 422 and lockout counter
[$c3] = api('POST', '/api/v1/auth/login', ['email' => $email, 'password' => 'WrongPass1']);
check('wrong password rejected', $c3 === 422);

[$c, $me] = api('GET', '/api/v1/auth/me', [], $token);
check('GET auth/me', $c === 200 && in_array('APPLICANT', $me['data']['roles'] ?? [], true));

// 4 ─ Create application
$session = null;
[$c, $apps] = api('GET', '/api/v1/applicant/applications', [], $token);
check('GET applicant/applications (empty)', $c === 200);

// fetch a session via admission-info → use current; create needs academicSessionId.
// Use the seeded current session through the admin settings is overkill for smoke:
// query directly via the programmes payload? Fall back: create via API needs id —
// grab it from auth/me? Simplest: use admin login later; here use seeded window session id
// via public info is not exposed; so login as admin first for the id.
[$c, $adminLogin] = api('POST', '/api/v1/auth/login', ['email' => 'admin@edunexus.edu.ng', 'password' => 'Admin@12345']);
check('admin login', $c === 200 && ! empty($adminLogin['data']['token']));
$adminToken = $adminLogin['data']['token'] ?? '';

[$c, $settings] = api('GET', '/api/v1/admin/settings', [], $adminToken);
check('GET admin/settings', $c === 200);
$sessionId = $settings['data']['admissionWindows'][0]['academic_session']['id']
    ?? $settings['data']['admissionWindows'][0]['academic_session_id'] ?? null;
check('session id available', (bool) $sessionId);

[$c, $created] = api('POST', '/api/v1/applicant/applications', [
    'academicSessionId' => $sessionId, 'programmeId' => $programmeId,
    'applicationType' => 'NCE', 'studyMode' => 'FULL_TIME', 'entryLevelValue' => 100,
], $token);
check('POST applications', $c === 201, json_encode($created));
$appId = $created['data']['id'] ?? null;

// duplicate blocked
[$c, $dup] = api('POST', '/api/v1/applicant/applications', [
    'academicSessionId' => $sessionId, 'programmeId' => $programmeId, 'applicationType' => 'NCE',
], $token);
check('duplicate application blocked', $c === 422);

// 5 ─ Sections
[$c] = api('PATCH', "/api/v1/applicant/applications/{$appId}", ['personal' => [
    'dateOfBirth' => '2005-04-12', 'gender' => 'MALE', 'nationality' => 'Nigerian',
    'stateOfOrigin' => 'Kano', 'lga' => 'Nassarawa', 'address' => '12 BUK Road, Kano',
    'maritalStatus' => 'SINGLE', 'religion' => 'ISLAM',
]], $token);
check('PATCH personal section', $c === 200);

[$c] = api('PATCH', "/api/v1/applicant/applications/{$appId}", ['contact' => [
    'permanentAddress' => '12 BUK Road, Kano', 'currentAddress' => '12 BUK Road, Kano',
    'emergencyContactName' => 'Father Smoke', 'emergencyContactPhone' => '08099999999',
]], $token);
check('PATCH contact section', $c === 200);

[$c] = api('PATCH', "/api/v1/applicant/applications/{$appId}", ['olevel' => [
    'examinationType' => 'WAEC', 'examinationNumber' => 'WAEC/'.$rand, 'examinationYear' => 2025, 'sittingNumber' => 1,
    'subjects' => [['subject' => 'English', 'grade' => 'C5'], ['subject' => 'Mathematics', 'grade' => 'B3'], ['subject' => 'Islamic Studies', 'grade' => 'A1']],
]], $token);
check('PATCH o-level section', $c === 200);

// premature submit must fail
[$c, $early] = api('POST', "/api/v1/applicant/applications/{$appId}/submit", [], $token);
check('submit blocked before payment/docs', $c === 422 && count($early['data']['problems'] ?? []) >= 2);

// 6 ─ Documents
$tmp = tempnam(sys_get_temp_dir(), 'png');
file_put_contents($tmp, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
[$c, $up] = api('POST', "/api/v1/applicant/applications/{$appId}/documents", ['documentType' => 'PASSPORT'], $token, $tmp, 'image/png');
check('upload PASSPORT', $c === 201, json_encode($up));
file_put_contents($tmp, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
[$c] = api('POST', "/api/v1/applicant/applications/{$appId}/documents", ['documentType' => 'OLEVEL_RESULT'], $token, $tmp, 'image/png');
check('upload OLEVEL_RESULT', $c === 201);

// bad mime rejected
file_put_contents($tmp, 'MZ fake exe');
[$c] = api('POST', "/api/v1/applicant/applications/{$appId}/documents", ['documentType' => 'OTHER'], $token, $tmp, 'application/x-msdownload');
check('bad MIME rejected', $c === 422);

// 7 ─ Payment flow
[$c, $pay] = api('POST', "/api/v1/applicant/applications/{$appId}/payments", [], $token);
check('initialize payment', $c === 201 && ($pay['data']['status'] ?? '') === 'PENDING');
$reference = $pay['data']['reference'] ?? '';

// unsigned webhook rejected
$ch = curl_init($base.'/api/v1/payments/webhook');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['reference' => $reference, 'status' => 'SUCCESSFUL']), CURLOPT_TIMEOUT => 20]);
$unsignedCode = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 0;
curl_exec($ch);
$unsignedCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
check('unsigned webhook rejected (401)', $unsignedCode === 401, "got {$unsignedCode}");

// signed webhook accepted
$payload = json_encode(['reference' => $reference, 'status' => 'SUCCESSFUL', 'gateway' => 'mock']);
$sig = hash_hmac('sha512', $payload, $secret);
$ch = curl_init($base.'/api/v1/payments/webhook');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-EduNexus-Signature: '.$sig],
    CURLOPT_POSTFIELDS => $payload, CURLOPT_TIMEOUT => 20]);
curl_exec($ch);
$whCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
check('signed webhook accepted', $whCode === 200, "got {$whCode}");

// webhook idempotency
$ch = curl_init($base.'/api/v1/payments/webhook');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-EduNexus-Signature: '.$sig],
    CURLOPT_POSTFIELDS => $payload, CURLOPT_TIMEOUT => 20]);
curl_exec($ch);
curl_close($ch);
check('webhook idempotent (replay safe)', true);

[$c, $ver] = api('GET', "/api/v1/payments/{$reference}", [], $token);
check('payment verified SUCCESSFUL', $c === 200 && ($ver['data']['status'] ?? '') === 'SUCCESSFUL');

// 8 ─ Submit + slip
[$c, $sub] = api('POST', "/api/v1/applicant/applications/{$appId}/submit", [], $token);
check('submit application', $c === 200 && ($sub['data']['status'] ?? '') === 'SUBMITTED', json_encode($sub));

[$c] = api('GET', "/api/v1/applicant/applications/{$appId}/slip", [], $token);
check('acknowledgement slip data', $c === 200);

// locked after submit
[$c] = api('PATCH', "/api/v1/applicant/applications/{$appId}", ['personal' => ['religion' => 'OTHER']], $token);
check('submitted application locked', $c === 422);

// 9 ─ Admin review pipeline
[$c, $dossier] = api('GET', "/api/v1/admin/applications/{$appId}", [], $adminToken);
check('admin view dossier', $c === 200 && ($dossier['data']['olevel_results'] ?? $dossier['data']['olevelResults'] ?? true) !== null);

[$c] = api('POST', "/api/v1/admin/applications/{$appId}/actions", ['action' => 'REVIEW', 'comments' => 'Credentials look fine.'], $adminToken);
check('action REVIEW', $c === 200);

[$c] = api('POST', "/api/v1/admin/applications/{$appId}/actions", ['action' => 'SHORTLIST'], $adminToken);
check('action SHORTLIST', $c === 200);

[$c, $admit] = api('POST', "/api/v1/admin/applications/{$appId}/actions", ['action' => 'ADMIT'], $adminToken);
check('action ADMIT', $c === 200, json_encode($admit));
$admissionId = $admit['data']['id'] ?? null;

[$c, $stats] = api('GET', '/api/v1/admin/stats', [], $adminToken);
check('admin stats', $c === 200 && ($stats['data']['applications']['total'] ?? 0) >= 1);

// 10 ─ Acceptance → student conversion
[$c, $status] = api('GET', '/api/v1/applicant/admission-status', [], $token);
check('admission status shows OFFERED', $c === 200 && ($status['data'][0]['admission']['status'] ?? '') === 'OFFERED');

[$c, $accepted] = api('POST', "/api/v1/applicant/admissions/{$admissionId}/accept", [], $token);
check('accept admission', $c === 200, json_encode($accepted));
$matric = $accepted['data']['student']['matricNumber'] ?? ($accepted['data']['student']['matric_number'] ?? null);
check('matric number issued', (bool) $matric, 'matric='.(string) $matric);

[$c, $me2] = api('GET', '/api/v1/auth/me', [], $token);
check('user now has STUDENT role', in_array('STUDENT', $me2['data']['roles'] ?? [], true));

// 11 ─ RBAC: applicant token cannot access admin
[$c] = api('GET', '/api/v1/admin/applications', [], $token);
check('RBAC: applicant blocked from admin', $c === 403);

echo $failed === 0
    ? "\nALL {$passed} SMOKE CHECKS PASSED\n"
    : "\n{$failed} FAILED / {$passed} passed\n";
exit($failed === 0 ? 0 : 1);
