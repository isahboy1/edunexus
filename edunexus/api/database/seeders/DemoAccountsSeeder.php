<?php

namespace Database\Seeders;

use App\Models\AcademicSession;
use App\Models\Admission;
use App\Models\Application;
use App\Models\ApplicationDocument;
use App\Models\ApplicationPayment;
use App\Models\ApplicationSetting;
use App\Models\Applicant;
use App\Models\Course;
use App\Models\CourseRegistration;
use App\Models\JambResult;
use App\Models\OlevelResult;
use App\Models\Programme;
use App\Models\Role;
use App\Models\Semester;
use App\Models\Student;
use App\Models\User;
use App\Services\AdmissionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Demo accounts for every portal (password: Admin@12345):
 *
 *   applicant@edunexus.edu.ng  APPLICANT  — application SUBMITTED (wizard, tracking, admin queue)
 *   admitted@edunexus.edu.ng   APPLICANT  — application ADMITTED, offer pending acceptance
 *   student@edunexus.edu.ng    STUDENT    — accepted, fee invoices + submitted course registration
 *
 * Staff/HOD/lecturer accounts are seeded by DatabaseSeeder.
 * Safe to re-run: every record is created only when missing.
 */
class DemoAccountsSeeder extends Seeder
{
    public const PASSWORD = 'Admin@12345';

    private const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function run(): void
    {
        $session = AcademicSession::where('is_current', true)->firstOrFail();
        $setting = ApplicationSetting::where('academic_session_id', $session->id)->firstOrFail();
        $programme = Programme::where('code', 'BED-EAP')->first()
            ?? Programme::where('status', 'ACTIVE')->orderBy('code')->firstOrFail();
        $admissions = app(AdmissionService::class);
        $adminId = User::where('email', 'admin@edunexus.edu.ng')->value('id');

        // 1. Applicant with a SUBMITTED application — feeds the applicant
        //    dashboard, admission tracking and the admin review queue.
        $submittedApp = $this->ensureApplication(
            $this->ensureUser('applicant@edunexus.edu.ng', 'Demo Applicant', 'APPLICANT', '08011111111'),
            $session, $setting, $programme
        );

        // 2. Admitted applicant — offer waiting to be accepted, so the
        //    acceptance → student conversion can be demonstrated live.
        $admittedApp = $this->ensureApplication(
            $this->ensureUser('admitted@edunexus.edu.ng', 'Admitted Applicant', 'APPLICANT', '08022222222'),
            $session, $setting, $programme
        );
        if (! $admittedApp->admission) {
            $admissions->admit($admittedApp, $adminId);
        }

        // 3. Student — full conversion chain (matric number, invoices) plus a
        //    submitted course registration for the HOD approval queue.
        $studentApp = $this->ensureApplication(
            $this->ensureUser('student@edunexus.edu.ng', 'Demo Student', 'APPLICANT', '08033333333'),
            $session, $setting, $programme
        );
        $admission = $studentApp->admission ?: $admissions->admit($studentApp, $adminId);
        $student = Student::where('admission_id', $admission->id)->first();
        if (! $student) {
            $student = $admissions->convertToStudent($admission->fresh());
        }
        $this->ensureRegistration($student);
    }

    /** Create the user (password reset every run) and attach the role. */
    private function ensureUser(string $email, string $name, string $role, string $phone): User
    {
        $user = User::updateOrCreate(
            ['email' => $email],
            ['name' => $name, 'phone' => $phone, 'password' => Hash::make(self::PASSWORD), 'status' => 'ACTIVE']
        );
        $user->roles()->syncWithoutDetaching([Role::where('name', $role)->value('id')]);

        return $user;
    }

    /**
     * Build a complete, SUBMITTED application (sections, JAMB, O'Level,
     * successful payment, required documents) if the applicant has none yet.
     */
    private function ensureApplication(User $user, AcademicSession $session, ApplicationSetting $setting, Programme $programme): Application
    {
        $applicant = Applicant::where('user_id', $user->id)->first();
        if (! $applicant) {
            $applicant = Applicant::create([
                'user_id' => $user->id,
                'application_number' => $this->nextApplicantNumber(),
                'surname' => explode(' ', $user->name)[0],
                'first_name' => explode(' ', $user->name)[1] ?? 'Demo',
                'date_of_birth' => '2004-05-10',
                'gender' => 'MALE',
                'nationality' => 'Nigerian',
                'state_of_origin' => 'Kano',
                'lga' => 'Nassarawa',
                'address' => '12 Zoo Road, Kano',
            ]);
        }

        $application = Application::where('applicant_id', $applicant->id)
            ->where('academic_session_id', $session->id)
            ->first();

        if ($application) {
            return $application;
        }

        $application = Application::create([
            'application_number' => $applicant->application_number.'-'.($applicant->applications()->count() + 1),
            'applicant_id' => $applicant->id,
            'academic_session_id' => $session->id,
            'programme_id' => $programme->id,
            'application_type' => 'UTME',
            'study_mode' => 'FULL_TIME',
            'entry_level_value' => 100,
            'status' => 'DRAFT',
            'payment_status' => 'PENDING',
        ]);

        $application->update([
            'permanent_address' => '12 Zoo Road, Kano',
            'current_address' => '12 Zoo Road, Kano',
            'emergency_contact_name' => 'Parent Demo',
            'emergency_contact_phone' => '08087654321',
            'marital_status' => 'SINGLE',
            'religion' => 'Islam',
        ]);

        // JAMB (required for UTME at submission)
        $jamb = JambResult::updateOrCreate(
            ['application_id' => $application->id],
            [
                'registration_number' => 'DEMO'.strtoupper(Str::random(8)),
                'examination_year' => 2026,
                'utme_score' => 245,
                'institution_choice' => 'EduNexus College',
            ]
        );
        $jamb->subjects()->delete();
        foreach ([['English Language', 65], ['Mathematics', 70], ['Economics', 55], ['Government', 55]] as [$subject, $score]) {
            $jamb->subjects()->create(['subject' => $subject, 'score' => $score]);
        }

        // O'Level result (required at submission)
        if ($application->olevelResults()->count() === 0) {
            $olevel = OlevelResult::create([
                'application_id' => $application->id,
                'examination_type' => 'WAEC',
                'examination_number' => 'WAEC'.strtoupper(Str::random(8)),
                'examination_year' => 2024,
                'sitting_number' => 1,
            ]);
            foreach ([['English Language', 'C4'], ['Mathematics', 'B3'], ['Economics', 'C5'], ['Government', 'C6'], ['Literature-in-English', 'B3']] as [$subject, $grade]) {
                $olevel->subjects()->create(['subject' => $subject, 'grade' => $grade]);
            }
        }

        // Application fee — recorded as already paid (webhook equivalent)
        if (! $application->hasSuccessfulPayment()) {
            $reference = 'APP-DEMO'.strtoupper(Str::random(10));
            ApplicationPayment::create([
                'application_id' => $application->id,
                'reference' => $reference,
                'amount' => $setting->application_fee,
                'currency' => $setting->currency,
                'gateway' => config('services.payment.gateway', 'mock'),
                'status' => 'SUCCESSFUL',
                'paid_at' => now(),
                'gateway_response' => ['gateway' => 'mock', 'reference' => $reference, 'status' => 'SUCCESSFUL'],
            ]);
        }

        // Required documents — real files on the private disk so downloads work
        if ($application->documents()->count() === 0) {
            foreach (['PASSPORT', 'OLEVEL_RESULT'] as $type) {
                $bytes = base64_decode(self::TINY_PNG);
                $stored = Str::uuid()->toString().'.png';
                Storage::disk('private')->put('documents/'.$stored, $bytes);
                ApplicationDocument::create([
                    'application_id' => $application->id,
                    'document_type' => $type,
                    'original_file_name' => strtolower($type).'.png',
                    'stored_file_name' => $stored,
                    'storage_path' => 'documents/'.$stored,
                    'mime_type' => 'image/png',
                    'file_size' => strlen($bytes),
                    'version' => 1,
                    'verification_status' => 'PENDING',
                    'uploaded_at' => now(),
                ]);
            }
        }

        $application->update([
            'status' => 'SUBMITTED',
            'submitted_at' => now(),
            'payment_status' => 'SUCCESSFUL',
        ]);

        return $application->fresh();
    }

    /**
     * Submit a full-credit course registration for the current semester so the
     * student portal and the HOD approval queue both have live data.
     */
    private function ensureRegistration(Student $student): void
    {
        $semester = Semester::whereHas('academicSession', fn ($q) => $q->where('is_current', true))
            ->orderByRaw("CASE name WHEN 'FIRST' THEN 1 ELSE 2 END")
            ->first();
        if (! $semester) {
            return;
        }

        $registration = CourseRegistration::where('student_id', $student->id)
            ->where('semester_id', $semester->id)
            ->first();
        if ($registration) {
            return;
        }

        $student->load('currentProgramme');
        $departmentId = $student->currentProgramme?->department_id;

        $courses = Course::where('status', 'ACTIVE')
            ->where('level_value', $student->current_level_value)
            ->where('semester', $semester->name)
            ->where(function ($q) use ($departmentId) {
                $q->when($departmentId, fn ($qq) => $qq->where('department_id', $departmentId))
                    ->orWhere('course_type', 'GST')
                    ->orWhere('course_type', 'FACULTY');
            })
            ->orderBy('code')
            ->get();

        // Respect the same 12–24 credit-unit window as the live submit flow.
        $picked = collect();
        $total = 0;
        foreach ($courses as $course) {
            if ($total + (int) $course->credit_units > 24) {
                continue;
            }
            $picked->push($course);
            $total += (int) $course->credit_units;
            if ($total >= 16) {
                break;
            }
        }
        if ($total < 12) {
            return;
        }

        $registration = CourseRegistration::create([
            'student_id' => $student->id,
            'semester_id' => $semester->id,
            'status' => 'SUBMITTED',
            'total_credit_units' => $total,
            'submitted_at' => now(),
        ]);
        foreach ($picked as $course) {
            $registration->items()->create([
                'course_id' => $course->id,
                'credit_units' => $course->credit_units,
            ]);
        }
    }

    /** Same numbering scheme as AuthController (EDU/YYYY/#####). */
    private function nextApplicantNumber(): string
    {
        $count = Applicant::count() + 1;
        do {
            $number = sprintf('EDU/%s/%05d', now()->format('Y'), $count);
            $exists = Applicant::where('application_number', $number)->exists();
            if ($exists) {
                $count++;
            }
        } while ($exists);

        return $number;
    }
}
