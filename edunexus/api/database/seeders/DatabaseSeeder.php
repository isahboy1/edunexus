<?php

namespace Database\Seeders;

use App\Models\AcademicSession;
use App\Models\Announcement;
use App\Models\ApplicationSetting;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\News;
use App\Models\Permission;
use App\Models\Programme;
use App\Models\Role;
use App\Models\Semester;
use App\Models\StaffProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * EDUNEXUS seed: RBAC, staff accounts, academic structure,
     * AKCILS-aligned programmes, admission window & content.
     */
    public function run(): void
    {
        // ── Roles (SRS §6) ───────────────────────────────────────
        $roles = collect([
            ['name' => 'SUPER_ADMIN', 'description' => 'Full system access'],
            ['name' => 'ADMIN', 'description' => 'Sub-admin: creates users and resets passwords'],
            ['name' => 'REGISTRAR', 'description' => 'Admissions, student records, sessions'],
            ['name' => 'ADMISSIONS_OFFICER', 'description' => 'Review, screen and process applications'],
            ['name' => 'ACADEMIC_OFFICER', 'description' => 'Programmes, courses, semesters, results'],
            ['name' => 'BURSARY_OFFICER', 'description' => 'Fees, payments, receipts, reports'],
            ['name' => 'HOD', 'description' => 'Department students, registrations, results review'],
            ['name' => 'LECTURER', 'description' => 'Assigned courses, scores, result submission'],
            ['name' => 'STUDENT', 'description' => 'Student portal access'],
            ['name' => 'APPLICANT', 'description' => 'Application portal access'],
        ])->mapWithKeys(fn ($r) => [$r['name'] => Role::updateOrCreate(['name' => $r['name']], $r)]);

        // ── Permissions (granular, SRS §5/§6) ────────────────────
        $permissionNames = [
            'applications.view', 'applications.review', 'applications.shortlist',
            'applications.screen', 'applications.admit', 'applications.reject',
            'applications.correction-request',
            'admissions.publish', 'admissions.revoke', 'admissions.letters',
            'students.view', 'students.manage', 'students.status',
            'structure.manage', 'courses.manage', 'semesters.manage',
            'results.enter', 'results.review', 'results.approve', 'results.publish',
            'fees.configure', 'payments.verify', 'payments.view', 'reports.financial',
            'users.manage', 'roles.manage', 'settings.manage', 'audit.view',
            'content.manage',
            'users.create', 'users.reset-password',
        ];
        $permissions = collect($permissionNames)
            ->mapWithKeys(fn ($p) => [$p => Permission::updateOrCreate(['name' => $p])]);

        // Role → permission matrix
        $matrix = [
            'SUPER_ADMIN' => $permissionNames,
            // Sub-admin: user management only — create users & reset passwords
            'ADMIN' => ['users.create', 'users.reset-password'],
            'REGISTRAR' => ['applications.view', 'applications.review', 'applications.admit', 'applications.reject', 'applications.correction-request', 'admissions.publish', 'admissions.revoke', 'admissions.letters', 'students.view', 'students.manage', 'students.status', 'reports.financial', 'audit.view', 'content.manage'],
            'ADMISSIONS_OFFICER' => ['applications.view', 'applications.review', 'applications.shortlist', 'applications.screen', 'applications.admit', 'applications.reject', 'applications.correction-request', 'admissions.letters', 'students.view'],
            'ACADEMIC_OFFICER' => ['structure.manage', 'courses.manage', 'semesters.manage', 'results.review', 'results.approve', 'results.publish', 'students.view'],
            'BURSARY_OFFICER' => ['fees.configure', 'payments.verify', 'payments.view', 'reports.financial'],
            'HOD' => ['students.view', 'courses.manage', 'results.review', 'results.enter'],
            'LECTURER' => ['results.enter'],
            'STUDENT' => [],
            'APPLICANT' => [],
        ];
        foreach ($matrix as $roleName => $perms) {
            $roles[$roleName]->permissions()->sync(
                collect($perms)->map(fn ($p) => $permissions[$p]->id)->all()
            );
        }

        // ── Levels ───────────────────────────────────────────────
        foreach ([100 => '100 Level', 200 => '200 Level', 300 => '300 Level', 400 => '400 Level'] as $v => $name) {
            Level::updateOrCreate(['numeric_value' => $v], ['name' => $name]);
        }

        // ── Academic session + semesters (2026/2027) ────────────
        $session = AcademicSession::updateOrCreate(
            ['name' => '2026/2027'],
            ['start_date' => '2026-10-01', 'end_date' => '2027-07-31', 'is_current' => true, 'status' => 'ACTIVE']
        );
        Semester::updateOrCreate(['academic_session_id' => $session->id, 'name' => 'FIRST'], ['status' => 'REGISTRATION']);
        Semester::updateOrCreate(['academic_session_id' => $session->id, 'name' => 'SECOND'], ['status' => 'UPCOMING']);

        // ── Admission window — RELATIVE to today so demo data never expires.
        //    Applications: open now (opened 30 days ago, close in 120 days).
        //    Registration: closes 7 days after applications do.
        ApplicationSetting::updateOrCreate(
            ['academic_session_id' => $session->id],
            [
                'application_fee' => 5500,
                'currency' => 'NGN',
                'opens_at' => now()->subDays(30)->startOfDay(),
                'closes_at' => now()->addDays(120)->endOfDay(),
                'registration_closes_at' => now()->addDays(127)->endOfDay(),
                'is_active' => true,
                'allowed_types' => ['UTME', 'DIRECT_ENTRY', 'PART_TIME', 'LONG_VACATION', 'NCE', 'DIPLOMA', 'PRE_NCE', 'PRE_DIPLOMA'],
            ]
        );

        // ── Academic structure + AKCILS programmes ──────────────
        // (Core: NCE / Diploma / Pre-NCE / Pre-Diploma; degrees are affiliation programmes)
        $structure = [
            'School of Education' => [
                'code' => 'EDU',
                'departments' => [
                    ['name' => 'Educational Administration and Planning', 'code' => 'EAP', 'programmes' => [
                        ['name' => 'NCE Educational Administration and Planning', 'code' => 'NCE-EAP', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.Ed Educational Administration and Planning', 'code' => 'BED-EAP', 'award' => 'B.Ed', 'duration' => 4],
                    ]],
                    ['name' => 'Guidance and Counselling', 'code' => 'GNC', 'programmes' => [
                        ['name' => 'NCE Guidance and Counselling', 'code' => 'NCE-GNC', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.Ed Guidance and Counselling', 'code' => 'BED-GNC', 'award' => 'B.Ed', 'duration' => 4],
                    ]],
                ],
            ],
            'School of Legal Studies' => [
                'code' => 'ILS',
                'departments' => [
                    ['name' => 'Islamic Studies', 'code' => 'ISS', 'programmes' => [
                        ['name' => 'NCE Islamic Studies', 'code' => 'NCE-ISS', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'Diploma in Islamic Studies', 'code' => 'DIP-ISS', 'award' => 'Diploma', 'duration' => 2],
                        ['name' => 'Pre-NCE Islamic Studies', 'code' => 'PRE-NCE-ISS', 'award' => 'Pre-NCE', 'duration' => 1],
                        ['name' => 'B.A Islamic Studies', 'code' => 'BA-ISS', 'award' => 'B.A', 'duration' => 4],
                    ]],
                    ['name' => 'Arabic Studies', 'code' => 'ARB', 'programmes' => [
                        ['name' => 'NCE Arabic', 'code' => 'NCE-ARB', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.A Arabic', 'code' => 'BA-ARB', 'award' => 'B.A', 'duration' => 4],
                    ]],
                    ['name' => 'Islamic Law / Shari\'ah', 'code' => 'SHR', 'programmes' => [
                        ['name' => 'Diploma in Shari\'ah Law', 'code' => 'DIP-SHR', 'award' => 'Diploma', 'duration' => 2],
                    ]],
                ],
            ],
            'School of Languages and Humanities' => [
                'code' => 'LNG',
                'departments' => [
                    ['name' => 'Hausa', 'code' => 'HUS', 'programmes' => [
                        ['name' => 'NCE Hausa', 'code' => 'NCE-HUS', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.A Hausa', 'code' => 'BA-HUS', 'award' => 'B.A', 'duration' => 4],
                    ]],
                    ['name' => 'English', 'code' => 'ENG', 'programmes' => [
                        ['name' => 'NCE English', 'code' => 'NCE-ENG', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.A (Ed) English Education', 'code' => 'BAE-ENG', 'award' => 'B.A (Ed)', 'duration' => 4],
                    ]],
                ],
            ],
            'School of Vocational and Technical Education' => [
                'code' => 'VTE',
                'departments' => [
                    ['name' => 'Computer Science Education', 'code' => 'CSE', 'programmes' => [
                        ['name' => 'NCE Computer Science Education', 'code' => 'NCE-CSE', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.Sc (Ed) Computer Science', 'code' => 'BSE-CSC', 'award' => 'B.Sc (Ed)', 'duration' => 4],
                    ]],
                    ['name' => 'Economics', 'code' => 'ECN', 'programmes' => [
                        ['name' => 'NCE Economics', 'code' => 'NCE-ECN', 'award' => 'NCE', 'duration' => 3],
                        ['name' => 'B.Sc Economics Education', 'code' => 'BSE-ECN', 'award' => 'B.Sc (Ed)', 'duration' => 4],
                    ]],
                ],
            ],
        ];

        foreach ($structure as $facultyName => $f) {
            $faculty = Faculty::updateOrCreate(['code' => $f['code']], ['name' => $facultyName]);
            foreach ($f['departments'] as $d) {
                $dept = Department::updateOrCreate(
                    ['code' => $d['code']],
                    ['faculty_id' => $faculty->id, 'name' => $d['name']]
                );
                foreach ($d['programmes'] as $p) {
                    Programme::updateOrCreate(
                        ['code' => $p['code']],
                        [
                            'department_id' => $dept->id,
                            'name' => $p['name'],
                            'award' => $p['award'],
                            'duration_years' => $p['duration'],
                        ]
                    );
                }
            }
        }

        // ── Staff users — credentials from the SHARED seed-credentials.json
        //    (same file the Next prisma/seed.ts reads, so both apps' demo
        //    accounts can never drift apart).
        $credentialsPath = dirname(__DIR__, 2).'/seed-credentials.json';
        $credentials = json_decode((string) file_get_contents($credentialsPath), true, 512, JSON_THROW_ON_ERROR);
        $seedPassword = $credentials['defaultPassword'];
        $seedStaff = collect($credentials['staff'])->keyBy('email');

        $staff = [
            ['email' => 'admin@edunexus.edu.ng', 'staff_no' => 'STF-001', 'office' => 'Registry'],
            ['email' => 'subadmin@edunexus.edu.ng', 'staff_no' => 'STF-006', 'office' => 'Registry'],
            ['email' => 'registrar@edunexus.edu.ng', 'staff_no' => 'STF-002', 'office' => 'Registry'],
            ['email' => 'admissions@edunexus.edu.ng', 'staff_no' => 'STF-003', 'office' => 'Admissions Unit'],
            ['email' => 'academic@edunexus.edu.ng', 'staff_no' => 'STF-004', 'office' => 'Academic Office'],
            ['email' => 'bursary@edunexus.edu.ng', 'staff_no' => 'STF-005', 'office' => 'Bursary'],
        ];
        foreach ($staff as $s) {
            $c = $seedStaff->get($s['email']);
            throw_unless($c, RuntimeException::class, "{$s['email']} missing from seed-credentials.json");
            $user = User::updateOrCreate(
                ['email' => $s['email']],
                ['name' => $c['name'], 'password' => Hash::make($seedPassword), 'status' => 'ACTIVE', 'email_verified_at' => now()]
            );
            $user->roles()->syncWithoutDetaching([$roles[$c['role']]->id]);
            StaffProfile::updateOrCreate(
                ['user_id' => $user->id],
                ['staff_no' => $s['staff_no'], 'office' => $s['office']]
            );
        }

        // ── Institution identity (admin-editable, SRS §58) ─────
        \App\Models\SystemSetting::updateOrCreate(
            ['key' => 'institution'],
            ['value' => [
                'name' => 'EduNexus College',
                'shortName' => 'EduNexus',
                'domain' => 'edunexus.edu.ng',
                'address' => 'BUK Road, Kano, Kano State',
                'email' => 'info@edunexus.edu.ng',
                'phone' => '+234 800 000 0000',
                'matricPrefix' => 'EDU',
                'admissionPrefix' => 'EDU/ADM',
            ], 'updated_at' => now()]
        );

        // ── Public content ──────────────────────────────────────
        News::updateOrCreate(
            ['slug' => '2026-2027-admissions-open'],
            [
                'title' => '2026/2027 Admissions: Applications Now Open',
                'content' => "Applications into NCE, Diploma, Pre-NCE, Pre-Diploma and affiliated degree programmes for the 2026/2027 academic session are now open.\n\nInterested candidates should register on this portal, complete the online application form, upload the required credentials and pay the non-refundable application fee before the deadline.",
                'excerpt' => 'Applications are open for NCE, Diploma, Pre-NCE, Pre-Diploma and affiliated degree programmes.',
                'status' => 'PUBLISHED',
                'author_name' => 'Registry',
                'published_at' => now(),
            ]
        );
        News::updateOrCreate(
            ['slug' => 'registration-deadline-notice'],
            [
                'title' => 'Registration Closes October 4 — Complete Your Process',
                'content' => "All admitted candidates must complete acceptance, payment at the designated bank using their RRR code, bursary confirmation, profile update and course registration before Registration closes on October 4, 2026.\n\nFresh students should follow the registration guideline issued by the Academic Office.",
                'excerpt' => 'Admitted candidates must complete all registration steps before October 4, 2026.',
                'status' => 'PUBLISHED',
                'author_name' => 'Academic Office',
                'published_at' => now(),
            ]
        );
        Announcement::updateOrCreate(
            ['title' => 'Important Notice to All Applicants'],
            [
                'message' => 'Complete your application and registration before the published deadlines. Late applications will not be processed.',
                'audience' => 'ALL',
                'status' => 'PUBLISHED',
                'starts_at' => now(),
                'ends_at' => '2026-10-04 23:59:59',
            ]
        );

        // ── Phase 3: fee structures (per programme level) ───────
        $feeBlueprint = [
            ['name' => 'Acceptance Fee', 'category' => 'ACCEPTANCE', 'amount' => 10000],
            ['name' => 'Tuition', 'category' => 'TUITION', 'amount' => 45000],
            ['name' => 'Registration', 'category' => 'REGISTRATION', 'amount' => 5000],
            ['name' => 'Library', 'category' => 'LIBRARY', 'amount' => 3000],
            ['name' => 'ICT', 'category' => 'ICT', 'amount' => 5000],
            ['name' => 'Examination', 'category' => 'EXAMINATION', 'amount' => 5000],
            ['name' => 'Medical', 'category' => 'MEDICAL', 'amount' => 2000],
            ['name' => 'Student Union', 'category' => 'STUDENT_UNION', 'amount' => 1000, 'mandatory' => false],
        ];

        $levels = [100, 200, 300];
        Programme::with('department')->chunkById(50, function ($programmes) use ($session, $feeBlueprint, $levels) {
            foreach ($programmes as $programme) {
                foreach ($levels as $level) {
                    foreach (['FRESH', 'RETURNING'] as $studentType) {
                        // Fresh pay acceptance + all items; returning skip acceptance
                        $items = collect($feeBlueprint)
                            ->reject(fn ($f) => $studentType === 'RETURNING' && $f['category'] === 'ACCEPTANCE')
                            ->map(fn ($f) => [
                                'name' => $f['name'],
                                'category' => $f['category'],
                                'amount' => $f['amount'] * ($programme->award === 'NCE' ? 0.8 : 1.0),
                                'is_mandatory' => $f['mandatory'] ?? true,
                            ])->all();

                        $structure = \App\Models\FeeStructure::updateOrCreate(
                            [
                                'academic_session_id' => $session->id,
                                'programme_id' => $programme->id,
                                'level_value' => $level,
                                'student_type' => $studentType,
                            ],
                            ['is_active' => true]
                        );
                        $structure->items()->delete();
                        foreach ($items as $item) {
                            $structure->items()->create($item);
                        }
                    }
                }
            }
        });

        // ── Phase 3: HOD + lecturer for the first department ────
        $firstDept = Department::with('faculty')->orderBy('id')->first();
        if ($firstDept) {
            $hod = User::updateOrCreate(
                ['email' => 'hod@edunexus.edu.ng'],
                ['name' => $seedStaff->get('hod@edunexus.edu.ng')['name'].' '.$firstDept->name, 'password' => Hash::make($seedPassword), 'status' => 'ACTIVE', 'email_verified_at' => now()]
            );
            $hod->roles()->syncWithoutDetaching([$roles['HOD']->id]);
            StaffProfile::updateOrCreate(['user_id' => $hod->id], ['staff_no' => 'STF-006', 'office' => $firstDept->name, 'department_id' => $firstDept->id]);

            $lecturer = User::updateOrCreate(
                ['email' => 'lecturer@edunexus.edu.ng'],
                ['name' => $seedStaff->get('lecturer@edunexus.edu.ng')['name'], 'password' => Hash::make($seedPassword), 'status' => 'ACTIVE', 'email_verified_at' => now()]
            );
            $lecturer->roles()->syncWithoutDetaching([$roles['LECTURER']->id]);
            \App\Models\Lecturer::updateOrCreate(
                ['user_id' => $lecturer->id],
                ['staff_number' => 'LEC-001', 'department_id' => $firstDept->id, 'designation' => 'Lecturer I']
            );

            // ── Semester courses for the first department ─────────
            $courses = [
                ['code' => 'GSS 101', 'title' => 'Use of English I', 'units' => 2, 'type' => 'GST'],
                ['code' => 'GSS 102', 'title' => 'Islamic Studies', 'units' => 2, 'type' => 'GST'],
                ['code' => strtoupper(substr($firstDept->code, 0, 3)).' 101', 'title' => 'Introduction to '.$firstDept->name, 'units' => 3, 'type' => 'CORE'],
                ['code' => strtoupper(substr($firstDept->code, 0, 3)).' 102', 'title' => 'Foundations of '.$firstDept->name, 'units' => 3, 'type' => 'CORE'],
                ['code' => strtoupper(substr($firstDept->code, 0, 3)).' 103', 'title' => 'Text & Practices in '.$firstDept->name, 'units' => 2, 'type' => 'ELECTIVE'],
                ['code' => 'GSS 104', 'title' => 'General Mathematics', 'units' => 2, 'type' => 'GST'],
                ['code' => 'GSS 105', 'title' => 'Computer Appreciation', 'units' => 2, 'type' => 'GST'],
            ];
            foreach ($courses as $c) {
                \App\Models\Course::updateOrCreate(
                    ['code' => $c['code']],
                    [
                        'department_id' => $firstDept->id,
                        'title' => $c['title'],
                        'credit_units' => $c['units'],
                        'level_value' => 100,
                        'semester' => 'FIRST',
                        'course_type' => $c['type'],
                    ]
                );
            }

            // Assign lecturer to two courses this semester
            $firstSemester = Semester::where('academic_session_id', $session->id)->where('name', 'FIRST')->first();
            $lecProfile = \App\Models\Lecturer::where('staff_number', 'LEC-001')->first();
            if ($firstSemester && $lecProfile) {
                foreach (\App\Models\Course::whereIn('code', ['GSS 101', strtoupper(substr($firstDept->code, 0, 3)).' 101'])->get() as $course) {
                    \App\Models\LecturerCourse::updateOrCreate(
                        ['lecturer_id' => $lecProfile->id, 'course_id' => $course->id, 'semester_id' => $firstSemester->id]
                    );
                }
            }
        }

        // ── Demo portal accounts (applicant / admitted / student) ───
        $this->call(DemoAccountsSeeder::class);
    }
}
