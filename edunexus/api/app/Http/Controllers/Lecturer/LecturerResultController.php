<?php

namespace App\Http\Controllers\Lecturer;

use App\Http\Controllers\Controller;
use App\Models\CourseRegistration;
use App\Models\CourseRegistrationItem;
use App\Models\Lecturer;
use App\Models\LecturerCourse;
use App\Models\Result;
use App\Models\Semester;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Lecturer result entry (SRS results chain, step 1):
 *  1. Lecturer opens their assigned-course roster and enters CA/exam scores.
 *  2. Scores save as DRAFT; submit moves the whole course to SUBMITTED where
 *     HOD/Academic approve and publish (see Admin\AcademicAdminController).
 */
class LecturerResultController extends Controller
{
    /** Current FIRST semester of the active session (assignment scope). */
    private function currentSemester(): ?Semester
    {
        return Semester::whereHas('academicSession', fn ($s) => $s->where('is_current', true))
            ->orderByRaw("CASE name WHEN 'FIRST' THEN 1 ELSE 2 END")
            ->first();
    }

    private function lecturerProfile(Request $request): Lecturer
    {
        $lecturer = Lecturer::where('user_id', $request->user()->id)->first();
        abort_unless($lecturer && $lecturer->is_active, 403, 'No active lecturer profile.');
        return $lecturer;
    }

    /**
     * GET /api/v1/lecturer/courses — assigned courses for the current semester
     * with result-entry progress.
     */
    public function courses(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'LECTURER');
        $lecturer = $this->lecturerProfile($request);
        $semester = $this->currentSemester();
        if (!$semester) {
            return $this->ok(['courses' => [], 'semester' => null]);
        }

        $assignments = LecturerCourse::with('course:id,code,title,credit_units')
            ->where('lecturer_id', $lecturer->id)
            ->where('semester_id', $semester->id)
            ->get();

        $courses = $assignments->map(function ($a) use ($semester) {
            $courseId = $a->course_id;

            $roster = CourseRegistration::where('semester_id', $semester->id)
                ->whereHas('items', fn ($i) => $i->where('course_id', $courseId))
                ->whereHas('student')
                ->with(['student:id,matric_number,user_id'])
                ->get();

            $studentIds = $roster->pluck('student_id');
            $results = Result::where('course_id', $courseId)
                ->where('semester_id', $semester->id)
                ->whereIn('student_id', $studentIds)
                ->get()
                ->keyBy('student_id');

            $entered = $results->filter(fn ($r) => $r->status !== 'REJECTED')->count();
            $statuses = $results->pluck('status')->unique()->values();

            return [
                'assignmentId' => $a->id,
                'courseId' => $courseId,
                'code' => $a->course?->code,
                'title' => $a->course?->title,
                'creditUnits' => $a->course?->credit_units,
                'enrolled' => $roster->count(),
                'entered' => $entered,
                'resultStatus' => $statuses->first() ?? null,
                'results' => $roster->map(fn ($reg) => [
                    'registrationId' => $reg->id,
                    'studentId' => $reg->student_id,
                    'matric' => $reg->student?->matric_number,
                    'name' => $reg->student?->user?->name,
                    'ca' => $results[$reg->student_id]->ca_score ?? null,
                    'exam' => $results[$reg->student_id]->exam_score ?? null,
                    'total' => $results[$reg->student_id]->total_score ?? null,
                    'grade' => $results[$reg->student_id]->grade ?? null,
                    'status' => $results[$reg->student_id]->status ?? null,
                ]),
            ];
        });

        return $this->ok([
            'semester' => ['id' => $semester->id, 'name' => $semester->name, 'session' => $semester->academicSession?->name],
            'courses' => $courses,
        ]);
    }

    /**
     * POST /api/v1/lecturer/courses/{courseId}/results — save scores (DRAFT).
     * body: { results: [{ studentId, ca, exam }] }
     */
    public function saveResults(Request $request, string $courseId): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'LECTURER');
        $lecturer = $this->lecturerProfile($request);
        $semester = $this->currentSemester();

        $data = $request->validate([
            'results' => ['required', 'array', 'min:1'],
            'results.*.studentId' => ['required', 'uuid'],
            'results.*.ca' => ['required', 'numeric', 'min:0', 'max:40'],
            'results.*.exam' => ['required', 'numeric', 'min:0', 'max:60'],
        ]);

        // The lecturer must be assigned to this course this semester.
        $assigned = LecturerCourse::where('lecturer_id', $lecturer->id)
            ->where('course_id', $courseId)
            ->when($semester, fn ($q) => $q->where('semester_id', $semester->id))
            ->exists();
        abort_unless($assigned, 403, 'You are not assigned to this course.');

        $gradeFrom = function (float $total): array {
            return match (true) {
                $total >= 70 => ['A', 5.0],
                $total >= 60 => ['B', 4.0],
                $total >= 50 => ['C', 3.0],
                $total >= 45 => ['D', 2.0],
                $total >= 40 => ['E', 1.0],
                default => ['F', 0.0],
            };
        };

        $saved = 0;
        DB::transaction(function () use ($data, $courseId, $semester, $gradeFrom, &$saved) {
            foreach ($data['results'] as $row) {
                $total = round((float) $row['ca'] + (float) $row['exam'], 2);
                [$grade, $gp] = $gradeFrom($total);

                Result::updateOrCreate(
                    [
                        'student_id' => $row['studentId'],
                        'course_id' => $courseId,
                        'semester_id' => $semester?->id,
                    ],
                    [
                        'ca_score' => $row['ca'],
                        'exam_score' => $row['exam'],
                        'total_score' => $total,
                        'grade' => $grade,
                        'grade_point' => $gp,
                        'status' => 'DRAFT',
                        'submitted_at' => null,
                        'approved_at' => null,
                        'published_at' => null,
                    ]
                );
                $saved++;
            }
        });

        $this->audit($user, 'RESULTS_SAVED_DRAFT', 'Result', $courseId, null, ['course' => $courseId, 'count' => $saved]);

        return $this->ok(['saved' => $saved], "Saved {$saved} score(s) as draft.");
    }

    /**
     * POST /api/v1/lecturer/courses/{courseId}/results/submit — lock and
     * forward the course results for approval (DRAFT → SUBMITTED).
     */
    public function submitResults(Request $request, string $courseId): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'LECTURER');
        $lecturer = $this->lecturerProfile($request);
        $semester = $this->currentSemester();

        $assigned = LecturerCourse::where('lecturer_id', $lecturer->id)
            ->where('course_id', $courseId)
            ->when($semester, fn ($q) => $q->where('semester_id', $semester->id))
            ->exists();
        abort_unless($assigned, 403, 'You are not assigned to this course.');

        $updated = Result::where('course_id', $courseId)
            ->where('semester_id', $semester?->id)
            ->whereIn('status', ['DRAFT'])
            ->update(['status' => 'SUBMITTED', 'submitted_at' => now()]);

        abort_unless($updated > 0, 422, 'No draft results to submit for this course.');

        $this->audit($user, 'RESULTS_SUBMITTED', 'Result', $courseId, null, ['course' => $courseId, 'count' => $updated]);

        return $this->ok(['submitted' => $updated], "{$updated} result(s) submitted for approval.");
    }
}
