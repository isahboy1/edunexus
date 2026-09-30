<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicSession;
use App\Models\FeeStructure;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentPortalController extends Controller
{
    /**
     * GET /api/v1/student/me — profile + programme + current registration state.
     */
    public function me(Request $request): JsonResponse
    {
        $student = $request->user()->student()->with([
            'currentProgramme.department.faculty',
            'registrations' => fn ($q) => $q->latest()->limit(1),
        ])->firstOrFail();

        return $this->ok([
            'matricNumber' => $student->matric_number,
            'name' => $request->user()->name,
            'email' => $request->user()->email,
            'status' => $student->status,
            'studentType' => $student->student_type,
            'entryType' => $student->entry_type,
            'admissionDate' => $student->admission_date?->toDateString(),
            'programme' => [
                'name' => $student->currentProgramme?->name,
                'award' => $student->currentProgramme?->award,
                'department' => $student->currentProgramme?->department?->name,
                'faculty' => $student->currentProgramme?->department?->faculty?->name,
            ],
            'level' => $student->current_level_value,
            'currentRegistration' => $student->registrations->first(),
            'outstandingBalance' => $student->outstandingBalance(),
        ]);
    }

    /**
     * GET /api/v1/student/fees — the SRS §33 financial dashboard:
     * total, paid, outstanding, invoices with items.
     */
    public function fees(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        $invoices = Invoice::with('academicSession:id,name')
            ->where('student_id', $student->id)
            ->orderByDesc('created_at')
            ->get();

        $total = (float) $invoices->where('status', '!=', 'CANCELLED')->sum('total_amount');
        $paid = (float) $invoices->where('status', '!=', 'CANCELLED')->sum('amount_paid');

        return $this->ok([
            'summary' => [
                'total' => $total,
                'paid' => $paid,
                'outstanding' => max(0, $total - $paid),
            ],
            'invoices' => $invoices->map(fn ($i) => [
                'id' => $i->id,
                'invoiceNumber' => $i->invoice_number,
                'type' => $i->invoice_type,
                'session' => $i->academicSession?->name,
                'total' => (float) $i->total_amount,
                'paid' => (float) $i->amount_paid,
                'balance' => (float) $i->balance,
                'status' => $i->status,
                'dueDate' => $i->due_date?->toDateString(),
            ]),
        ]);
    }

    /**
     * GET /api/v1/student/payments — payment history (receipts data).
     */
    public function payments(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        return $this->ok(
            $student->payments()->with('invoice:id,invoice_number,invoice_type')
                ->orderByDesc('created_at')->get()->map(fn ($p) => [
                    'reference' => $p->reference,
                    'rrr' => $p->rrr,
                    'amount' => (float) $p->amount,
                    'currency' => $p->currency,
                    'gateway' => $p->gateway,
                    'status' => $p->status,
                    'paidAt' => $p->paid_at?->toIso8601String(),
                    'invoice' => $p->invoice?->invoice_number,
                    'invoiceType' => $p->invoice?->invoice_type,
                    // Printable receipt (student-owned payment lookup).
                    'receiptUrl' => '/student/receipts/'.$p->reference,
                ])
        );
    }

    /**
     * GET /api/v1/student/transcript — the signed-in student's own academic
     * record: PUBLISHED results grouped by session/semester with GPA/CGPA.
     */
    public function transcript(Request $request): JsonResponse
    {
        $student = $request->user()->student()->with(['user:id,name', 'currentProgramme:id,name,code,award'])->firstOrFail();

        $results = \App\Models\Result::with(['course:id,code,title,credit_units', 'semester.academicSession:id,name'])
            ->where('student_id', $student->id)
            ->where('status', 'PUBLISHED')
            ->get()
            ->groupBy(fn ($r) => $r->semester->academicSession->name.'|'.$r->semester->name);

        $sessions = $results->map(function ($rows, $key) {
            [$sessionName, $semesterName] = explode('|', $key);
            $creditSum = (int) $rows->sum(fn ($r) => $r->course->credit_units);
            $weighted = $rows->sum(fn ($r) => (float) $r->grade_point * $r->course->credit_units);
            $gpa = $creditSum > 0 ? round($weighted / $creditSum, 2) : null;

            return [
                'session' => $sessionName,
                'semester' => $semesterName,
                'courses' => $rows->map(fn ($r) => [
                    'code' => $r->course->code,
                    'title' => $r->course->title,
                    'creditUnits' => $r->course->credit_units,
                    'ca' => (float) $r->ca_score,
                    'exam' => (float) $r->exam_score,
                    'total' => (float) $r->total_score,
                    'grade' => $r->grade,
                    'gradePoint' => (float) $r->grade_point,
                ])->values(),
                'creditUnits' => $creditSum,
                'gpa' => $gpa,
            ];
        })->values();

        $totalCredits = collect($sessions)->sum('creditUnits');
        $weightedAll = collect($sessions)->sum(
            fn ($s) => collect($s['courses'])->sum(fn ($c) => $c['gradePoint'] * $c['creditUnits'])
        );
        $cgpa = $totalCredits > 0 ? round($weightedAll / $totalCredits, 2) : null;

        return $this->ok([
            'student' => [
                'name' => $student->user?->name,
                'matric' => $student->matric_number,
                'programme' => $student->currentProgramme?->name,
                'award' => $student->currentProgramme?->award,
                'level' => $student->current_level_value,
            ],
            'sessions' => $sessions,
            'cumulative' => ['creditUnits' => $totalCredits, 'cgpa' => $cgpa],
        ]);
    }

    /**
     * GET /api/v1/student/registration-documents — the printed-forms checklist
     * from the AKCILS registration procedure (SIF, CRF, undertaking, library,
     * exam slip) with readiness flags.
     */
    public function registrationDocuments(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        $currentReg = $student->registrations()->latest()->first();
        $feesCleared = $student->outstandingBalance() <= 0.0;
        $registrationApproved = in_array($currentReg?->status, ['HOD_APPROVED', 'APPROVED'], true);

        return $this->ok([
            'forms' => [
                ['code' => 'SIF', 'title' => 'Student Information Form', 'available' => $feesCleared, 'requires' => $feesCleared ? null : 'Fee payment'],
                ['code' => 'CRF', 'title' => 'Course Registration Form', 'available' => $registrationApproved, 'requires' => $registrationApproved ? null : 'Course registration approved'],
                ['code' => 'UNDERTAKING', 'title' => 'Undertaking Form', 'available' => $feesCleared, 'requires' => $feesCleared ? null : 'Fee payment'],
                ['code' => 'LIBRARY', 'title' => 'Library Form', 'available' => $feesCleared, 'requires' => $feesCleared ? null : 'Fee payment'],
                ['code' => 'EXAM_SLIP', 'title' => 'Examination Slip', 'available' => $registrationApproved && $feesCleared, 'requires' => $registrationApproved ? ($feesCleared ? null : 'Fee payment') : 'Course registration approved'],
            ],
            'registrationStatus' => $currentReg?->status,
            'feesCleared' => $feesCleared,
        ]);
    }
}
