<?php

use App\Http\Controllers\Admin\AcademicAdminController;
use App\Http\Controllers\Admin\ApplicationAdminController;
use App\Http\Controllers\Admin\BrandingController;
use App\Http\Controllers\Admin\SystemAdminController;
use App\Http\Controllers\Applicant\ApplicationController;
use App\Http\Controllers\Applicant\DocumentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Bursary\PaymentConfirmationController;
use App\Http\Controllers\Lecturer\LecturerResultController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\Student\RegistrationController;
use App\Http\Controllers\Student\StudentPaymentController;
use App\Http\Controllers\Student\StudentPortalController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| EDUNEXUS API v1 (Laravel + Sanctum)
|--------------------------------------------------------------------------
*/

Route::prefix('v1')->group(function () {
    // ── Auth ────────────────────────────────────────────────────
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        // Shared notification feed (SRS §35) — personal rows for any portal,
        // plus staff broadcasts for staff accounts.
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read', [NotificationController::class, 'markRead']);

        // ── Applicant portal ────────────────────────────────────
        Route::prefix('applicant')->middleware('role:APPLICANT,STUDENT,SUPER_ADMIN')->group(function () {
            Route::get('/applications', [ApplicationController::class, 'index']);
            Route::post('/applications', [ApplicationController::class, 'store']);
            Route::get('/applications/{id}', [ApplicationController::class, 'show']);
            Route::get('/applications/{id}/completeness', [ApplicationController::class, 'completeness']);
            Route::patch('/applications/{id}', [ApplicationController::class, 'update']);
            Route::post('/applications/{id}/submit', [ApplicationController::class, 'submit']);
            Route::post('/applications/{id}/payments', [ApplicationController::class, 'initializePayment']);
            Route::get('/applications/{id}/slip', [ApplicationController::class, 'slip']);
            Route::get('/applications/{id}/documents', [DocumentController::class, 'index']);
            Route::post('/applications/{id}/documents', [DocumentController::class, 'store']);
            Route::delete('/applications/{id}/documents/{docId}', [DocumentController::class, 'destroy']);
            Route::get('/applications/{id}/documents/{docId}/download', [DocumentController::class, 'download']);
            Route::get('/admission-status', [ApplicationController::class, 'admissionStatus']);
            Route::post('/admissions/{admissionId}/accept', [ApplicationController::class, 'acceptAdmission']);
        });

        // ── Payments (authenticated lookup) ─────────────────────
        Route::get('/payments/{reference}', [PaymentController::class, 'show']);
    });

    // ── Payments webhook (signature-verified, no auth) ──────────
    Route::post('/payments/webhook', [PaymentController::class, 'webhook']);

    // ── Bursary checkpoints (AKCILS registration procedure) ────
    Route::prefix('bursary')->middleware(['auth:sanctum', 'role:BURSARY_OFFICER,REGISTRAR'])->group(function () {
        Route::get('/payments', [PaymentConfirmationController::class, 'index']);
        Route::get('/payments/{reference}', [PaymentConfirmationController::class, 'show']);
        Route::post('/payments/{reference}/confirm', [PaymentConfirmationController::class, 'confirm']);
        Route::post('/payments/{reference}/verify', [PaymentConfirmationController::class, 'verifyWithGateway']);
    });

    // ── Student portal (Phase 3) ───────────────────────────────
    Route::prefix('student')->middleware(['auth:sanctum', 'role:STUDENT'])->group(function () {
        Route::get('/me', [StudentPortalController::class, 'me']);
        Route::get('/fees', [StudentPortalController::class, 'fees']);
        Route::get('/payments', [StudentPortalController::class, 'payments']);
        Route::get('/registration-documents', [StudentPortalController::class, 'registrationDocuments']);

        // ── School-fee payments ─────────────────────────────────
        Route::get('/invoices', [StudentPaymentController::class, 'invoices']);
        Route::post('/invoices/{invoice}/payments', [StudentPaymentController::class, 'initialize']);
        Route::get('/payments/{reference}', [StudentPaymentController::class, 'show']);

        Route::get('/courses/eligible', [RegistrationController::class, 'eligibleCourses']);
        Route::get('/registration', [RegistrationController::class, 'show']);
        Route::put('/registration', [RegistrationController::class, 'update']);
        Route::post('/registration/submit', [RegistrationController::class, 'submit']);
        Route::post('/registration/{item}/drop', [RegistrationController::class, 'drop']);
        Route::get('/registration/slip', [RegistrationController::class, 'slip']);
        Route::get('/transcript', [StudentPortalController::class, 'transcript']);

    });

    // ── Lecturer result entry ───────────────────────────────────
    Route::prefix('lecturer')->middleware(['auth:sanctum', 'role:LECTURER'])->group(function () {
        Route::get('/courses', [LecturerResultController::class, 'courses']);
        Route::post('/courses/{courseId}/results', [LecturerResultController::class, 'saveResults']);
        Route::post('/courses/{courseId}/results/submit', [LecturerResultController::class, 'submitResults']);
    });

    // ── Registration approvals (HOD + Academic) ─────────────────
    Route::middleware(['auth:sanctum'])->group(function () {
        Route::get('/admin/registrations', [RegistrationController::class, 'queue']);
        Route::post('/admin/registrations/{id}/approve', [RegistrationController::class, 'approve']);
    });

    // ── Public content ──────────────────────────────────────────
    // White-label logo stream (falls back to the bundled /logo.png).
    Route::get('/branding/logo', [BrandingController::class, 'logoFile']);
    Route::get('/programmes', [PaymentController::class, 'programmes']);
    Route::get('/public/admission-info', [PaymentController::class, 'admissionInfo']);
    Route::get('/public/settings', [SystemAdminController::class, 'publicSettings']);
    Route::get('/public/news', [PaymentController::class, 'news']);
    Route::get('/public/announcements', [PaymentController::class, 'announcements']);

    // ── Admin ───────────────────────────────────────────────────
    Route::prefix('admin')->middleware('auth:sanctum')->group(function () {
        Route::get('/applications', [ApplicationAdminController::class, 'index']);
        Route::get('/applications/{id}', [ApplicationAdminController::class, 'show']);
        Route::get('/applications/{id}/completeness', [ApplicationAdminController::class, 'completeness']);
        Route::get('/applications/{id}/documents/{docId}/download', [ApplicationAdminController::class, 'downloadDocument']);
        Route::post('/applications/{id}/documents/{docId}/verify', [ApplicationAdminController::class, 'verifyDocument']);
        Route::post('/applications/bulk-admit', [ApplicationAdminController::class, 'bulkAdmit']);
        Route::post('/applications/{id}/actions', [ApplicationAdminController::class, 'action']);
        Route::get('/stats', [ApplicationAdminController::class, 'stats']);
        Route::post('/admissions/{id}/revoke', [ApplicationAdminController::class, 'revokeAdmission']);

        Route::get('/settings', [SystemAdminController::class, 'getSettings']);
        Route::put('/settings', [SystemAdminController::class, 'updateSettings']);
        Route::put('/admission-windows/{id}', [SystemAdminController::class, 'updateAdmissionWindow']);
        Route::get('/audit-logs', [SystemAdminController::class, 'auditLogs']);
        Route::get('/users', [SystemAdminController::class, 'listUsers']);
        Route::post('/users', [SystemAdminController::class, 'createUser']);
        Route::post('/users/{id}/reset-password', [SystemAdminController::class, 'resetPassword']);

        // ── Academic & finance administration ──────────────────
        Route::get('/students', [AcademicAdminController::class, 'students']);
        Route::get('/students/{id}/transcript', [AcademicAdminController::class, 'transcript']);
        Route::get('/promotion/preview', [AcademicAdminController::class, 'promotionPreview']);
        Route::post('/promotion/apply', [AcademicAdminController::class, 'promotionApply']);
        Route::get('/results', [AcademicAdminController::class, 'results']);
        Route::post('/results/{id}/action', [AcademicAdminController::class, 'resultAction']);
        Route::get('/fees', [AcademicAdminController::class, 'fees']);
        Route::post('/fees', [AcademicAdminController::class, 'storeFeeStructure']);
        Route::patch('/fees/{id}', [AcademicAdminController::class, 'updateFeeStructure']);
        Route::get('/invoices', [AcademicAdminController::class, 'invoices']);
        Route::post('/invoices', [AcademicAdminController::class, 'storeInvoice']);

        // ── Bursary finance summary ─────────────────────────────
        Route::get('/finance-summary', [AcademicAdminController::class, 'financeSummary']);
        Route::get('/finance-summary/export', [AcademicAdminController::class, 'financeSummaryCsv']);

        // ── White-label branding ────────────────────────────────
        Route::get('/branding', [BrandingController::class, 'show']);
        Route::put('/branding', [BrandingController::class, 'update']);
        Route::post('/branding/logo', [BrandingController::class, 'uploadLogo']);
        Route::delete('/branding/logo', [BrandingController::class, 'deleteLogo']);
    });
});
