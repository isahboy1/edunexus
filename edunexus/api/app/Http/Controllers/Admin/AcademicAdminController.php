<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FeeItem;
use App\Models\FeeStructure;
use App\Models\Invoice;
use App\Models\Level;
use App\Models\Result;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Academic & finance administration:
 *  - Student promotion (session rollover)
 *  - Result approval chain (SUBMITTED → APPROVED → PUBLISHED)
 *  - Fee structures (create / itemise / deactivate)
 *  - Invoices (ledger + manual invoice)
 *  - Academic transcript (per student, PUBLISHED results only)
 */
class AcademicAdminController extends Controller
{
    /* ═══════════════════════════ STUDENTS DIRECTORY ══════════════════ */

    /** GET /api/v1/admin/students?level=&status=&q= — directory for pickers/transcripts. */
    public function students(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER', 'BURSARY_OFFICER');

        $q = Student::query()->with(['user:id,name,email', 'currentProgramme:id,name,code'])
            ->orderBy('matric_number');

        if ($request->filled('level')) {
            $q->where('current_level_value', (int) $request->query('level'));
        }
        if ($request->filled('status')) {
            $q->where('status', strtoupper($request->string('status')));
        }
        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';
            $q->where('matric_number', 'like', $term)
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', $term));
        }

        return $this->ok($q->paginate((int) $request->query('perPage', '25')));
    }

    /* ═══════════════════════════ STUDENT PROMOTION ═══════════════════ */

    /**
     * GET /api/v1/admin/promotion/preview — cohort counts per level.
     */
    public function promotionPreview(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER');

        $maxLevel = (int) (Level::max('numeric_value') ?: 400);

        $byLevel = Student::query()
            ->selectRaw('current_level_value as levelValue, count(*) as count')
            ->where('status', 'ACTIVE')
            ->groupBy('current_level_value')
            ->orderBy('current_level_value')
            ->get();

        return $this->ok([
            'maxLevel' => $maxLevel,
            'levels' => Level::orderBy('numeric_value')->get(['numeric_value', 'name']),
            'byLevel' => $byLevel,
            'total' => Student::where('status', 'ACTIVE')->count(),
        ]);
    }

    /**
     * POST /api/v1/admin/promotion/apply
     * body: { fromLevel?: 100, targetLevel?: 200, studentIds?: uuid[] }
     * Promotes ACTIVE students from fromLevel (or every non-finalist level
     * when omitted) to fromLevel+100 / targetLevel. Never beyond the highest
     * configured level (400 finalists stay put). Audited.
     */
    public function promotionApply(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER');

        $data = $request->validate([
            'fromLevel' => ['nullable', 'integer'],
            'targetLevel' => ['nullable', 'integer', 'gt:fromLevel'],
            'studentIds' => ['nullable', 'array'],
            'studentIds.*' => ['uuid'],
        ]);

        $maxLevel = (int) (Level::max('numeric_value') ?: 400);
        $from = isset($data['fromLevel']) ? (int) $data['fromLevel'] : null;
        $target = isset($data['targetLevel']) ? (int) $data['targetLevel'] : null;

        $query = Student::query()->where('status', 'ACTIVE');
        if ($from !== null) {
            $query->where('current_level_value', $from);
        } else {
            $query->where('current_level_value', '<', $maxLevel);
        }
        if (! empty($data['studentIds'])) {
            $query->whereIn('id', $data['studentIds']);
        }

        $students = $query->get();
        $promoted = 0;
        $details = [];

        DB::transaction(function () use ($students, $target, $maxLevel, &$promoted, &$details) {
            foreach ($students as $student) {
                $fromLevel = (int) $student->current_level_value;
                $to = $target ?? ($fromLevel + 100);
                if ($to > $maxLevel || $to <= $fromLevel) {
                    continue;
                }
                $student->update(['current_level_value' => $to]);
                $promoted++;
                $details[] = ['matric' => $student->matric_number, 'from' => $fromLevel, 'to' => $to];
            }
        });

        $this->audit($user, 'STUDENTS_PROMOTED', 'Student', null, null, [
            'promoted' => $promoted,
            'targetLevel' => $target,
            'details' => array_slice($details, 0, 50),
        ]);

        return $this->ok(['promoted' => $promoted, 'details' => array_slice($details, 0, 50)], "Promoted {$promoted} student(s).");
    }

    /* ═══════════════════════════ RESULT APPROVAL ══════════════════════ */

    /**
     * GET /api/v1/admin/results?status=&semesterId=&q= — approval ledger.
     */
    public function results(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER', 'HOD');

        $q = Result::query()->with([
            'student.user:id,name', 'student:id,matric_number,user_id,current_programme_id',
            'course:id,code,title,credit_units', 'semester.academicSession:id,name',
        ])->orderByDesc('updated_at');

        if ($request->filled('status')) {
            $q->where('status', strtoupper($request->string('status')));
        }
        if ($request->filled('semesterId')) {
            $q->where('semester_id', $request->string('semesterId'));
        }
        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';
            $q->whereHas('student', fn ($s) => $s->where('matric_number', 'like', $term)
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', $term)));
        }

        return $this->ok($q->paginate((int) $request->query('perPage', '25')));
    }

    /**
     * POST /api/v1/admin/results/{id}/action  body: { action }
     * APPROVE: SUBMITTED → APPROVED  (HOD, ACADEMIC_OFFICER, REGISTRAR, SUPER_ADMIN)
     * PUBLISH: APPROVED → PUBLISHED  (ACADEMIC_OFFICER, REGISTRAR, SUPER_ADMIN)
     * REJECT:  SUBMITTED|APPROVED → REJECTED (HOD and above)
     */
    public function resultAction(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER', 'HOD');

        $data = $request->validate(['action' => ['required', 'in:APPROVE,PUBLISH,REJECT']]);
        $action = $data['action'];

        // student.user is needed for the publication notification below —
        // lazy loading is disabled, so it must be eager-loaded here.
        $result = Result::with(['student.user:id,name,email', 'student:id,matric_number,user_id', 'course:id,code,title'])->findOrFail($id);

        if ($action === 'APPROVE') {
            $this->authorizeRoles($user, 'HOD', 'ACADEMIC_OFFICER', 'REGISTRAR', 'SUPER_ADMIN');
            abort_unless($result->status === 'SUBMITTED', 422, 'Only submitted results can be approved.');
            $result->update(['status' => 'APPROVED', 'approved_at' => now()]);
            $this->audit($user, 'RESULT_APPROVED', 'Result', $result->id, null, [
                'course' => $result->course->code, 'student' => $result->student->matric_number,
            ]);
        } elseif ($action === 'PUBLISH') {
            $this->authorizeRoles($user, 'ACADEMIC_OFFICER', 'REGISTRAR', 'SUPER_ADMIN');
            abort_unless($result->status === 'APPROVED', 422, 'Results must be approved before publication.');
            $result->update(['status' => 'PUBLISHED', 'published_at' => now()]);
            $this->audit($user, 'RESULT_PUBLISHED', 'Result', $result->id, null, [
                'course' => $result->course->code, 'student' => $result->student->matric_number,
            ]);
            \App\Services\NotificationService::notifyUser(
                $result->student->user,
                'Result published',
                sprintf('Your result for %s (%s) has been published. View it in My Transcript.', $result->course->code, $result->course->title),
                ['result_id' => $result->id, 'course' => $result->course->code],
            );
        } else {
            $this->authorizeRoles($user, 'HOD', 'ACADEMIC_OFFICER', 'REGISTRAR', 'SUPER_ADMIN');
            abort_unless(in_array($result->status, ['SUBMITTED', 'APPROVED'], true), 422, 'Only pending results can be rejected.');
            $result->update(['status' => 'REJECTED', 'approved_at' => null, 'published_at' => null]);
            $this->audit($user, 'RESULT_REJECTED', 'Result', $result->id, null, [
                'course' => $result->course->code, 'student' => $result->student->matric_number,
            ]);
        }

        return $this->ok($result->fresh(['course:id,code,title']), 'Result updated.');
    }

    /* ═══════════════════════════ FEE MANAGEMENT ═══════════════════════ */

    /** GET /api/v1/admin/fees — structures + invoice stats. */
    public function fees(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $structures = FeeStructure::with(['academicSession:id,name', 'programme:id,name,code', 'items'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'session' => $s->academicSession?->name,
                'programme' => $s->programme?->name,
                'programmeCode' => $s->programme?->code,
                'levelValue' => $s->level_value,
                'studentType' => $s->student_type,
                'isActive' => $s->is_active,
                'total' => (float) $s->items->sum('amount'),
                'itemCount' => $s->items->count(),
            ]);

        $invoiceStats = Invoice::query()
            ->selectRaw('status, count(*) as n, coalesce(sum(total_amount),0) as total, coalesce(sum(balance),0) as balance')
            ->whereIn('status', ['UNPAID', 'PARTIALLY_PAID', 'PAID'])
            ->groupBy('status')
            ->get();

        return $this->ok([
            'structures' => $structures,
            'invoiceStats' => $invoiceStats,
            'options' => [
                'sessions' => \App\Models\AcademicSession::orderByDesc('start_date')->get(['id', 'name', 'is_current']),
                'programmes' => \App\Models\Programme::orderBy('name')->get(['id', 'name', 'code']),
                'levels' => Level::orderBy('numeric_value')->get(['numeric_value', 'name']),
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/fees — create a fee structure with items.
     * body: { academicSessionId, programmeId, levelValue, studentType?, items:[{name, amount, category?}] }
     */
    public function storeFeeStructure(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'BURSARY_OFFICER');

        $data = $request->validate([
            'academicSessionId' => ['required', 'uuid', Rule::exists('academic_sessions', 'id')],
            'programmeId' => ['required', 'uuid', Rule::exists('programmes', 'id')],
            'levelValue' => ['required', 'integer'],
            'studentType' => ['nullable', 'in:FRESH,RETURNING'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.name' => ['required', 'string', 'max:150'],
            'items.*.amount' => ['required', 'numeric', 'min:0'],
            'items.*.category' => ['nullable', Rule::in(['TUITION', 'REGISTRATION', 'LIBRARY', 'ICT', 'EXAMINATION', 'DEVELOPMENT', 'MEDICAL', 'STUDENT_UNION', 'ACCEPTANCE', 'OTHER'])],
        ]);

        $structure = DB::transaction(function () use ($data) {
            $structure = FeeStructure::create([
                'academic_session_id' => $data['academicSessionId'],
                'programme_id' => $data['programmeId'],
                'level_value' => $data['levelValue'],
                'student_type' => $data['studentType'] ?? 'FRESH',
                'is_active' => true,
            ]);

            FeeItem::insert(collect($data['items'])->map(fn ($i) => [
                'id' => (string) Str::uuid(),
                'fee_structure_id' => $structure->id,
                'name' => $i['name'],
                'category' => $i['category'] ?? 'OTHER',
                'amount' => (float) $i['amount'],
                'created_at' => now(),
                'updated_at' => now(),
            ])->all());

            return $structure;
        });

        $this->audit($user, 'FEE_STRUCTURE_CREATED', 'FeeStructure', $structure->id, null, [
            'programmeId' => $data['programmeId'], 'level' => $data['levelValue'],
        ]);

        return $this->ok(['id' => $structure->id], 'Fee structure created.', 201);
    }

    /** PATCH /api/v1/admin/fees/{id} — activate/deactivate a structure. */
    public function updateFeeStructure(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'BURSARY_OFFICER');

        $data = $request->validate(['isActive' => ['required', 'boolean']]);
        $structure = FeeStructure::findOrFail($id);
        $old = $structure->only('is_active');
        $structure->update(['is_active' => $data['isActive']]);

        $this->audit($user, 'FEE_STRUCTURE_UPDATED', 'FeeStructure', $structure->id, $old, ['is_active' => $data['isActive']]);

        return $this->ok(['id' => $structure->id, 'isActive' => $structure->is_active], 'Fee structure updated.');
    }

    /* ═══════════════════════════ INVOICES ═════════════════════════════ */

    /** GET /api/v1/admin/invoices — finance ledger. */
    public function invoices(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $q = Invoice::query()->with(['student.user:id,name', 'student:id,matric_number,user_id', 'academicSession:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $q->where('status', strtoupper($request->string('status')));
        }
        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';
            $q->where('invoice_number', 'like', $term)
                ->orWhereHas('student', fn ($s) => $s->where('matric_number', 'like', $term)
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', $term)));
        }

        return $this->ok([
            ...$q->paginate((int) $request->query('perPage', '25'))->toArray(),
            'sessions' => \App\Models\AcademicSession::orderByDesc('start_date')->get(['id', 'name', 'is_current']),
        ]);
    }

    /**
     * POST /api/v1/admin/invoices — manual invoice (bursary).
     * body: { studentId, sessionId, total, dueDate? }
     */
    public function storeInvoice(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'BURSARY_OFFICER');

        $data = $request->validate([
            'studentId' => ['required', 'uuid', Rule::exists('students', 'id')],
            'sessionId' => ['required', 'uuid', Rule::exists('academic_sessions', 'id')],
            'total' => ['required', 'numeric', 'min:0'],
            'dueDate' => ['nullable', 'date'],
        ]);

        $invoice = Invoice::create([
            'invoice_number' => 'INV-'.strtoupper(Str::random(10)),
            'student_id' => $data['studentId'],
            'invoice_type' => 'SCHOOL_FEES',
            'academic_session_id' => $data['sessionId'],
            'total_amount' => (float) $data['total'],
            'amount_paid' => 0,
            'balance' => (float) $data['total'],
            'status' => 'UNPAID',
            'due_date' => $data['dueDate'] ?? null,
        ]);

        $this->audit($user, 'INVOICE_CREATED', 'Invoice', $invoice->id, null, [
            'number' => $invoice->invoice_number, 'total' => $invoice->total_amount,
        ]);

        return $this->ok(['id' => $invoice->id, 'number' => $invoice->invoice_number], 'Invoice created.', 201);
    }

    /* ═══════════════════════════ TRANSCRIPT ═══════════════════════════ */

    /**
     * GET /api/v1/admin/students/{id}/transcript — grouped by session/semester
     * with GPA per term and CGPA. PUBLISHED results only.
     */
    public function transcript(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR', 'ACADEMIC_OFFICER');

        $student = Student::with(['user:id,name,email', 'currentProgramme:id,name,code,award'])->findOrFail($id);

        $results = Result::with(['course:id,code,title,credit_units', 'semester.academicSession:id,name'])
            ->where('student_id', $id)
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
                    'id' => $r->id,
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
                'id' => $student->id,
                'name' => $student->user?->name,
                'matric' => $student->matric_number,
                'programme' => $student->currentProgramme?->name,
                'award' => $student->currentProgramme?->award,
                'level' => $student->current_level_value,
                'status' => $student->status,
            ],
            'sessions' => $sessions,
            'cumulative' => ['creditUnits' => $totalCredits, 'cgpa' => $cgpa],
        ]);
    }

    /* ═══════════════════════ BURSARY FINANCE SUMMARY ═══════════════════ */

    /**
     * GET /api/v1/admin/finance-summary?days=14 — bursary overview:
     * confirmed payments per day (school fees + application fees), invoice
     * totals per invoice type, and outstanding balances per level of study.
     */
    public function financeSummary(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        return $this->ok($this->financeSummaryData($request));
    }

    /**
     * GET /api/v1/admin/finance-summary/export — CSV download of the same
     * summary in labelled sections: totals, daily, by type, by level.
     */
    public function financeSummaryCsv(Request $request)
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $data = $this->financeSummaryData($request);
        $filename = 'finance-summary-'.now()->toDateString().'.csv';

        $callback = function () use ($data) {
            $out = fopen('php://output', 'w');

            fputcsv($out, ['Bursary finance summary — generated', now()->toIso8601String()]);
            fputcsv($out, []);

            fputcsv($out, ['Totals']);
            fputcsv($out, ['Billed (NGN)', 'Paid (NGN)', 'Outstanding (NGN)', 'Confirmed in window (NGN)', 'Confirmed payments', 'Window (days)']);
            fputcsv($out, [
                $data['totals']['billed'], $data['totals']['paid'], $data['totals']['outstanding'],
                $data['totals']['confirmedLast'], $data['totals']['confirmedCountLast'], $data['totals']['days'],
            ]);
            fputcsv($out, []);

            fputcsv($out, ['Confirmed payments per day']);
            fputcsv($out, ['Day', 'Payments', 'Total (NGN)']);
            foreach ($data['daily'] as $row) {
                fputcsv($out, [$row['day'], $row['count'], $row['total']]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Invoices by type']);
            fputcsv($out, ['Type', 'Invoices', 'Billed (NGN)', 'Paid (NGN)', 'Outstanding (NGN)']);
            foreach ($data['byType'] as $row) {
                fputcsv($out, [$row['type'], $row['invoices'], $row['billed'], $row['paid'], $row['outstanding']]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Outstanding by level']);
            fputcsv($out, ['Level', 'Students with balance', 'Outstanding (NGN)']);
            foreach ($data['byLevel'] as $row) {
                fputcsv($out, [$row['level'] !== null ? 'Level '.$row['level'] : 'Unassigned', $row['students'], $row['outstanding']]);
            }

            fclose($out);
        };

        return response()->streamDownload($callback, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** Shared aggregation for the JSON endpoint and the CSV export. */
    private function financeSummaryData(Request $request): array
    {
        $days = min(90, max(1, (int) $request->query('days', '14')));
        $since = now()->subDays($days - 1)->startOfDay();

        // Confirmed payments per day across BOTH payment kinds.
        $feePayments = DB::table('payments')
            ->selectRaw("to_char(paid_at, 'YYYY-MM-DD') as day, count(*) as n, coalesce(sum(amount),0) as total")
            ->where('status', 'SUCCESSFUL')->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$since, now()])
            ->groupBy('day');

        $appPayments = DB::table('application_payments')
            ->selectRaw("to_char(paid_at, 'YYYY-MM-DD') as day, count(*) as n, coalesce(sum(amount),0) as total")
            ->where('status', 'SUCCESSFUL')->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$since, now()])
            ->groupBy('day');

        $byDay = $feePayments->unionAll($appPayments)->get()
            ->groupBy('day')->map(fn ($rows, $day) => [
                'day' => $day,
                'count' => (int) $rows->sum('n'),
                'total' => (float) $rows->sum('total'),
            ])
            ->sortBy('day')->values();

        // Fill the calendar so zero days appear too.
        $daily = collect();
        for ($d = $since->copy(); $d->lte(now()); $d->addDay()) {
            $key = $d->toDateString();
            $daily->push($byDay->firstWhere('day', $key) ?? ['day' => $key, 'count' => 0, 'total' => 0.0]);
        }

        // Invoice totals per invoice type (whole ledger, non-cancelled).
        $byType = Invoice::query()
            ->selectRaw("invoice_type, count(*) as invoices, coalesce(sum(total_amount),0) as billed, coalesce(sum(amount_paid),0) as paid, coalesce(sum(balance),0) as outstanding")
            ->whereIn('status', ['UNPAID', 'PARTIALLY_PAID', 'PAID'])
            ->groupBy('invoice_type')
            ->orderBy('invoice_type')
            ->get()
            ->map(fn ($r) => [
                'type' => $r->invoice_type,
                'invoices' => (int) $r->invoices,
                'billed' => (float) $r->billed,
                'paid' => (float) $r->paid,
                'outstanding' => (float) $r->outstanding,
            ]);

        // Outstanding balances per current level of study.
        $byLevel = Invoice::query()
            ->join('students', 'students.id', '=', 'invoices.student_id')
            ->whereIn('invoices.status', ['UNPAID', 'PARTIALLY_PAID'])
            ->where('invoices.balance', '>', 0)
            ->selectRaw("students.current_level_value as level, count(distinct invoices.student_id) as students, coalesce(sum(invoices.balance),0) as outstanding")
            ->groupBy('students.current_level_value')
            ->orderBy('students.current_level_value')
            ->get()
            ->map(fn ($r) => [
                'level' => $r->level !== null ? (int) $r->level : null,
                'students' => (int) $r->students,
                'outstanding' => (float) $r->outstanding,
            ]);

        return [
            'totals' => [
                'billed' => (float) $byType->sum('billed'),
                'paid' => (float) $byType->sum('paid'),
                'outstanding' => (float) $byType->sum('outstanding'),
                'confirmedLast' => (float) $daily->sum('total'),
                'confirmedCountLast' => (int) $daily->sum('count'),
                'days' => $days,
            ],
            'daily' => $daily->all(),
            'byType' => $byType->all(),
            'byLevel' => $byLevel->all(),
        ];
    }

}
