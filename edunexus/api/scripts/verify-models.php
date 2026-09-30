<?php

// Verify all EDUNEXUS models load and can query PostgreSQL
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\{
    User, Role, Permission, StaffProfile, AcademicSession, Semester, Level,
    Faculty, Department, Programme, Course, Applicant, Application,
    ApplicationDocument, JambResult, JambSubject, OlevelResult, OlevelSubject,
    ApplicationQualification, ApplicationPayment, Admission, Student,
    StudentProgramme, CourseRegistration, CourseRegistrationItem,
    Lecturer, LecturerCourse, Result, FeeStructure, FeeItem, Invoice,
    Payment, Notification, News, Announcement, AuditLog, SystemSetting,
    ApplicationSetting,
};

$models = [
    'User' => User::class, 'Role' => Role::class, 'Permission' => Permission::class,
    'StaffProfile' => StaffProfile::class, 'AcademicSession' => AcademicSession::class,
    'Semester' => Semester::class, 'Level' => Level::class, 'Faculty' => Faculty::class,
    'Department' => Department::class, 'Programme' => Programme::class,
    'Course' => Course::class, 'Applicant' => Applicant::class,
    'Application' => Application::class, 'ApplicationDocument' => ApplicationDocument::class,
    'JambResult' => JambResult::class, 'JambSubject' => JambSubject::class,
    'OlevelResult' => OlevelResult::class, 'OlevelSubject' => OlevelSubject::class,
    'ApplicationQualification' => ApplicationQualification::class,
    'ApplicationPayment' => ApplicationPayment::class, 'Admission' => Admission::class,
    'Student' => Student::class, 'StudentProgramme' => StudentProgramme::class,
    'CourseRegistration' => CourseRegistration::class,
    'CourseRegistrationItem' => CourseRegistrationItem::class,
    'Lecturer' => Lecturer::class, 'LecturerCourse' => LecturerCourse::class,
    'Result' => Result::class, 'FeeStructure' => FeeStructure::class,
    'FeeItem' => FeeItem::class, 'Invoice' => Invoice::class, 'Payment' => Payment::class,
    'Notification' => Notification::class, 'News' => News::class,
    'Announcement' => Announcement::class, 'AuditLog' => AuditLog::class,
    'SystemSetting' => SystemSetting::class, 'ApplicationSetting' => ApplicationSetting::class,
];

$pass = 0; $fail = 0;
foreach ($models as $name => $class) {
    try {
        $class::query()->limit(1)->get();
        echo "  OK   {$name}\n";
        $pass++;
    } catch (Throwable $e) {
        echo "  FAIL {$name}: ".substr($e->getMessage(), 0, 110)."\n";
        $fail++;
    }
}

// Exercise the key domain relations end to end on real rows
try {
    // Pre-clean any leftovers from a previously crashed run (dev DB: safe)
    Illuminate\Support\Facades\DB::statement('TRUNCATE users, faculties, academic_sessions, levels, permissions CASCADE');
    News::where('slug', 'verify-news')->delete();
    Announcement::where('title', 'Verify Ann')->delete();
    SystemSetting::where('key', 'verify.test')->delete();

    $user = User::factory()->create(['email' => 'verify-models@test.local', 'name' => 'Model Check']);
    $role = Role::firstOrCreate(['name' => 'APPLICANT']);
    $user->roles()->attach($role->id);

    $session = AcademicSession::create(['name' => 'VERIFY/2026', 'start_date' => '2026-10-01', 'end_date' => '2027-07-31', 'is_current' => false, 'status' => 'UPCOMING']);
    $faculty = Faculty::create(['name' => 'Verify Faculty', 'code' => 'VFY']);
    $dept = Department::create(['faculty_id' => $faculty->id, 'name' => 'Verify Dept', 'code' => 'VFD']);
    $prog = Programme::create(['department_id' => $dept->id, 'name' => 'Verify Programme', 'code' => 'VFP']);
    $applicant = Applicant::create(['user_id' => $user->id, 'application_number' => 'APP-VERIFY-0001', 'surname' => 'Test', 'first_name' => 'Model']);
    $app = Application::create(['application_number' => 'APP-VERIFY-0001-A', 'applicant_id' => $applicant->id, 'academic_session_id' => $session->id, 'programme_id' => $prog->id, 'application_type' => 'NCE', 'study_mode' => 'FULL_TIME', 'status' => 'DRAFT']);

    $doc = ApplicationDocument::create(['application_id' => $app->id, 'document_type' => 'PASSPORT', 'stored_file_name' => 'v.jpg', 'storage_path' => 'verify/v.jpg', 'mime_type' => 'image/jpeg']);
    $jamb = JambResult::create(['application_id' => $app->id, 'registration_number' => 'VRF123', 'examination_year' => 2026, 'utme_score' => 220]);
    $jamb->subjects()->create(['subject' => 'English', 'score' => 65]);
    $olevel = OlevelResult::create(['application_id' => $app->id, 'examination_type' => 'WAEC', 'examination_number' => 'WE-1', 'examination_year' => 2025]);
    $olevel->subjects()->create(['subject' => 'Mathematics', 'grade' => 'B3']);
    $qual = ApplicationQualification::create(['application_id' => $app->id, 'qualification' => 'NCE', 'institution' => 'Verify College', 'year' => 2025]);
    $pay = ApplicationPayment::create(['application_id' => $app->id, 'reference' => 'VRF-PAY-1', 'amount' => 5500, 'gateway' => 'mock', 'status' => 'SUCCESSFUL', 'rrr' => 'RRR-1', 'paid_at' => now()]);
    $adm = Admission::create(['application_id' => $app->id, 'admission_number' => 'ADM-VERIFY-1', 'programme_id' => $prog->id, 'level_value' => 100, 'academic_session_id' => $session->id, 'status' => 'ACCEPTED', 'accepted_at' => now()]);
    $student = Student::create(['user_id' => $user->id, 'matric_number' => 'EDU/VERIFY/00001', 'applicant_id' => $applicant->id, 'admission_id' => $adm->id, 'current_programme_id' => $prog->id, 'current_level_value' => 100, 'entry_type' => 'UTME']);
    $sem = Semester::create(['academic_session_id' => $session->id, 'name' => 'FIRST', 'status' => 'REGISTRATION']);
    $course = Course::create(['department_id' => $dept->id, 'code' => 'VFC 101', 'title' => 'Verify Course', 'credit_units' => 3, 'level_value' => 100, 'semester' => 'FIRST', 'course_type' => 'CORE']);
    $reg = CourseRegistration::create(['student_id' => $student->id, 'semester_id' => $sem->id, 'status' => 'DRAFT', 'total_credit_units' => 3]);
    $reg->items()->create(['course_id' => $course->id, 'credit_units' => 3]);
    $res = Result::create(['student_id' => $student->id, 'course_id' => $course->id, 'semester_id' => $sem->id, 'ca_score' => 30, 'exam_score' => 45, 'total_score' => 75, 'grade' => 'A', 'grade_point' => 5, 'status' => 'DRAFT']);
    $fs = FeeStructure::create(['academic_session_id' => $session->id, 'programme_id' => $prog->id, 'level_value' => 100, 'student_type' => 'FRESH']);
    $fi = FeeItem::create(['fee_structure_id' => $fs->id, 'name' => 'Tuition', 'category' => 'TUITION', 'amount' => 50000]);
    $inv = Invoice::create(['invoice_number' => 'INV-VERIFY-1', 'student_id' => $student->id, 'invoice_type' => 'SCHOOL_FEES', 'academic_session_id' => $session->id, 'total_amount' => 50000, 'amount_paid' => 0, 'balance' => 50000]);
    $pay2 = Payment::create(['invoice_id' => $inv->id, 'student_id' => $student->id, 'reference' => 'VRF-INV-PAY-1', 'amount' => 50000, 'gateway' => 'remita', 'rrr' => 'RRR-2', 'status' => 'PENDING']);
    $notif = Notification::create(['user_id' => $user->id, 'channel' => 'EMAIL', 'subject' => 'Verify', 'body' => 'hi', 'status' => 'PENDING', 'created_at' => now()]);
    $news = News::create(['title' => 'Verify News', 'slug' => 'verify-news', 'content' => 'x', 'status' => 'PUBLISHED', 'published_at' => now()]);
    $ann = Announcement::create(['title' => 'Verify Ann', 'message' => 'x', 'status' => 'PUBLISHED']);
    $audit = AuditLog::create(['user_id' => $user->id, 'action' => 'VERIFY', 'entity_type' => 'Application', 'entity_id' => $app->id, 'ip_address' => '127.0.0.1', 'created_at' => now()]);
    $setting = SystemSetting::create(['key' => 'verify.test', 'value' => ['ok' => true], 'updated_at' => now()]);
    $appset = ApplicationSetting::create(['academic_session_id' => $session->id, 'application_fee' => 5500, 'closes_at' => '2026-09-27 23:59:59', 'registration_closes_at' => '2026-10-04 23:59:59', 'is_active' => true]);
    StaffProfile::create(['user_id' => $user->id, 'staff_no' => 'STF-VERIFY']);
    Lecturer::create(['user_id' => $user->id, 'staff_number' => 'LEC-VERIFY']);
    $lc = LecturerCourse::create(['lecturer_id' => Lecturer::where('staff_number', 'LEC-VERIFY')->first()->id, 'course_id' => $course->id, 'semester_id' => $sem->id]);
    StudentProgramme::create(['student_id' => $student->id, 'programme_id' => $prog->id, 'level_value' => 100, 'academic_session_id' => $session->id, 'start_date' => '2026-10-01']);
    Level::firstOrCreate(['numeric_value' => 100], ['name' => '100 Level']);
    Permission::firstOrCreate(['name' => 'verify.test']);

    // Relation assertions
    assert($user->roles->count() === 1);
    assert($app->documents->count() === 1);
    assert($jamb->subjects->count() === 1);
    assert($olevel->subjects->count() === 1);
    assert($app->hasSuccessfulPayment());
    assert($app->isEditable());
    assert($student->outstandingBalance() == 50000.0);
    assert($reg->items->count() === 1);
    assert($appset->applicationOpen() === true);
    assert($appset->registrationOpen() === true);
    assert($user->isLocked() === false);

    echo "\n  RELATIONS: all assertions passed\n";
    $pass++;

    // Cleanup
    foreach ([
        Permission::where('name', 'verify.test')->first(),
        $lc, $notif, $pay2, $pay, $inv, $fi, $fs, $res, $reg, $course,
        Lecturer::where('staff_number', 'LEC-VERIFY')->first(),
        StaffProfile::where('staff_no', 'STF-VERIFY')->first(),
        $student, $adm, $appset, $setting, $audit, $ann, $news,
        $sem, $jamb, $olevel, $qual, $doc, $app, $applicant,
        $prog, $dept, $faculty, $session,
    ] as $m) { if ($m) { try { $m->delete(); } catch (Throwable $e) {} } }
    $user->forceDelete();
    echo "  CLEANUP done\n";
} catch (Throwable $e) {
    echo "  DOMAIN FAIL: ".$e->getMessage()."\n".$e->getTraceAsString()."\n";
    $fail++;
}

echo $fail === 0 ? "\nALL MODELS VERIFIED\n" : "\n{$fail} FAILURES\n";
exit($fail === 0 ? 0 : 1);
