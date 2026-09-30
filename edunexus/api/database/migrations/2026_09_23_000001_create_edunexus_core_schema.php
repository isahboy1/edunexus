<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── ENUM TYPES ────────────────────────────────────────────────
        DB::statement("DO $$ BEGIN
            CREATE TYPE user_status AS ENUM ('ACTIVE','SUSPENDED','LOCKED','DELETED');
            CREATE TYPE role_name AS ENUM ('SUPER_ADMIN','REGISTRAR','ADMISSIONS_OFFICER','ACADEMIC_OFFICER','BURSARY_OFFICER','HOD','LECTURER','STUDENT','APPLICANT');
            CREATE TYPE session_status AS ENUM ('UPCOMING','ACTIVE','CLOSED');
            CREATE TYPE semester_name AS ENUM ('FIRST','SECOND');
            CREATE TYPE semester_status AS ENUM ('UPCOMING','REGISTRATION','IN_PROGRESS','RESULTS','CLOSED');
            CREATE TYPE programme_status AS ENUM ('ACTIVE','INACTIVE');
            CREATE TYPE course_type AS ENUM ('CORE','ELECTIVE','GST','DEPARTMENTAL','FACULTY');
            CREATE TYPE course_status AS ENUM ('ACTIVE','INACTIVE');
            CREATE TYPE gender AS ENUM ('MALE','FEMALE');
            CREATE TYPE application_type AS ENUM ('UTME','DIRECT_ENTRY','PART_TIME','LONG_VACATION','NCE','DIPLOMA','PRE_NCE','PRE_DIPLOMA','OTHER');
            CREATE TYPE study_mode AS ENUM ('FULL_TIME','PART_TIME','SANDWICH','REMOTE');
            CREATE TYPE application_status AS ENUM ('DRAFT','PAYMENT_PENDING','PAID','SUBMITTED','UNDER_REVIEW','SHORTLISTED','SCREENING','ADMITTED','REJECTED','WITHDRAWN');
            CREATE TYPE payment_status AS ENUM ('PENDING','PROCESSING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED','WAIVED');
            CREATE TYPE document_type AS ENUM ('PASSPORT','OLEVEL_RESULT','JAMB_RESULT','BIRTH_CERTIFICATE','LGA_CERTIFICATE','NCE_CERTIFICATE','ND_CERTIFICATE','HND_CERTIFICATE','IJMB_RESULT','DEGREE_CERTIFICATE','JAMB_ADMISSION_LETTER','OTHER');
            CREATE TYPE verification_status AS ENUM ('PENDING','VERIFIED','REJECTED');
            CREATE TYPE olevel_exam_type AS ENUM ('WAEC','NECO','NABTEB','NBAIS','OTHER');
            CREATE TYPE qualification_type AS ENUM ('NCE','ND','HND','IJMB','ALEVEL','DIPLOMA','DEGREE','OTHER');
            CREATE TYPE admission_status AS ENUM ('OFFERED','ACCEPTED','DECLINED','WITHDRAWN');
            CREATE TYPE student_status AS ENUM ('ACTIVE','SUSPENDED','DEFERRED','GRADUATED','WITHDRAWN','EXPELLED','DECEASED');
            CREATE TYPE entry_type AS ENUM ('UTME','DIRECT_ENTRY','TRANSFER','OTHER');
            CREATE TYPE registration_status AS ENUM ('DRAFT','SUBMITTED','HOD_APPROVED','APPROVED','REJECTED');
            CREATE TYPE result_status AS ENUM ('DRAFT','SUBMITTED','HOD_REVIEWED','APPROVED','PUBLISHED','REJECTED');
            CREATE TYPE fee_category AS ENUM ('TUITION','REGISTRATION','LIBRARY','ICT','EXAMINATION','DEVELOPMENT','MEDICAL','STUDENT_UNION','ACCEPTANCE','OTHER');
            CREATE TYPE invoice_status AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','CANCELLED');
            CREATE TYPE notification_channel AS ENUM ('EMAIL','SMS','IN_APP');
            CREATE TYPE notification_status AS ENUM ('PENDING','SENT','FAILED','READ');
            CREATE TYPE content_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
            CREATE TYPE student_type AS ENUM ('FRESH','RETURNING');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;");

        // ── IDENTITY & ACCESS ─────────────────────────────────────────
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 150);
            $table->string('email', 255)->unique();
            $table->string('phone', 30)->nullable();
            $table->string('password', 255);
            $table->timestampTz('email_verified_at')->nullable();
            $table->timestampTz('phone_verified_at')->nullable();
            $table->enum('status', ['ACTIVE','SUSPENDED','LOCKED','DELETED'])->default('ACTIVE');
            $table->unsignedSmallInteger('failed_logins')->default(0);
            $table->timestampTz('locked_until')->nullable();
            $table->timestampTz('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestampsTz();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestampTz('created_at')->nullable();
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('name', ['SUPER_ADMIN','REGISTRAR','ADMISSIONS_OFFICER','ACADEMIC_OFFICER','BURSARY_OFFICER','HOD','LECTURER','STUDENT','APPLICANT'])->unique();
            $table->string('description')->nullable();
            $table->timestampsTz();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100)->unique();
            $table->string('description')->nullable();
        });

        Schema::create('role_permission', function (Blueprint $table) {
            $table->uuid('role_id');
            $table->uuid('permission_id');
            $table->primary(['role_id', 'permission_id']);
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
        });

        Schema::create('user_role', function (Blueprint $table) {
            $table->uuid('user_id');
            $table->uuid('role_id');
            $table->primary(['user_id', 'role_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->timestampTz('assigned_at')->useCurrent();
        });

        Schema::create('staff_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->unique();
            $table->string('staff_no', 100)->nullable();
            $table->string('office', 150)->nullable();
            $table->uuid('department_id')->nullable();
            $table->timestampsTz();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // ── ACADEMIC STRUCTURE ────────────────────────────────────────
        Schema::create('academic_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 50)->unique();
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_current')->default(false);
            $table->enum('status', ['UPCOMING','ACTIVE','CLOSED'])->default('UPCOMING');
            $table->timestampsTz();
        });

        Schema::create('semesters', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('academic_session_id');
            $table->enum('name', ['FIRST','SECOND']);
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->enum('status', ['UPCOMING','REGISTRATION','IN_PROGRESS','RESULTS','CLOSED'])->default('UPCOMING');
            $table->timestampsTz();
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions')->cascadeOnDelete();
            $table->unique(['academic_session_id', 'name']);
        });

        Schema::create('levels', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('numeric_value')->unique();
            $table->string('name', 30);
        });

        Schema::create('faculties', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 150);
            $table->string('code', 30)->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();
        });

        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('faculty_id');
            $table->string('name', 150);
            $table->string('code', 30)->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();
            $table->foreign('faculty_id')->references('id')->on('faculties');
        });

        Schema::create('programmes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('department_id');
            $table->string('name', 200);
            $table->string('code', 50)->unique();
            $table->string('award', 100)->nullable();       // NCE, Diploma, B.Ed...
            $table->string('level_kind', 30)->default('TERTIARY'); // future use
            $table->decimal('duration_years', 3, 1)->nullable();
            $table->text('description')->nullable();
            $table->enum('status', ['ACTIVE','INACTIVE'])->default('ACTIVE');
            $table->timestampsTz();
            $table->foreign('department_id')->references('id')->on('departments');
        });

        Schema::create('courses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('department_id');
            $table->string('code', 30)->unique();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('credit_units');
            $table->unsignedSmallInteger('level_value')->nullable();
            $table->enum('semester', ['FIRST','SECOND'])->nullable();
            $table->enum('course_type', ['CORE','ELECTIVE','GST','DEPARTMENTAL','FACULTY']);
            $table->enum('status', ['ACTIVE','INACTIVE'])->default('ACTIVE');
            $table->timestampsTz();
            $table->foreign('department_id')->references('id')->on('departments');
        });

        Schema::create('course_prerequisites', function (Blueprint $table) {
            $table->uuid('course_id');
            $table->uuid('prerequisite_course_id');
            $table->primary(['course_id', 'prerequisite_course_id']);
            $table->foreign('course_id')->references('id')->on('courses')->cascadeOnDelete();
            $table->foreign('prerequisite_course_id')->references('id')->on('courses')->cascadeOnDelete();
        });

        // ── APPLICANTS & APPLICATIONS ─────────────────────────────────
        Schema::create('applicants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->unique();
            $table->string('application_number', 50)->unique();
            $table->string('surname', 100);
            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->enum('gender', ['MALE','FEMALE'])->nullable();
            $table->string('nationality', 100)->nullable();
            $table->string('state_of_origin', 100)->nullable();
            $table->string('lga', 100)->nullable();
            $table->text('address')->nullable();
            $table->uuid('passport_document_id')->nullable();
            $table->timestampsTz();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('applications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('application_number', 50)->unique();
            $table->uuid('applicant_id');
            $table->uuid('academic_session_id');
            $table->uuid('programme_id');
            $table->enum('application_type', ['UTME','DIRECT_ENTRY','PART_TIME','LONG_VACATION','NCE','DIPLOMA','PRE_NCE','PRE_DIPLOMA','OTHER']);
            $table->enum('study_mode', ['FULL_TIME','PART_TIME','SANDWICH','REMOTE'])->default('FULL_TIME');
            $table->unsignedSmallInteger('entry_level_value')->nullable();
            $table->enum('status', ['DRAFT','PAYMENT_PENDING','PAID','SUBMITTED','UNDER_REVIEW','SHORTLISTED','SCREENING','ADMITTED','REJECTED','WITHDRAWN'])->default('DRAFT');
            $table->enum('payment_status', ['PENDING','PROCESSING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED','WAIVED'])->default('PENDING');
            $table->text('permanent_address')->nullable();
            $table->text('current_address')->nullable();
            $table->string('emergency_contact_name', 150)->nullable();
            $table->string('emergency_contact_phone', 30)->nullable();
            $table->text('emergency_contact_address')->nullable();
            $table->string('marital_status', 30)->nullable();
            $table->string('religion', 50)->nullable();
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->text('review_comments')->nullable();
            $table->timestampTz('decided_at')->nullable();
            $table->text('decision_comments')->nullable();
            $table->timestampsTz();
            $table->foreign('applicant_id')->references('id')->on('applicants');
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions');
            $table->foreign('programme_id')->references('id')->on('programmes');
            $table->index(['status']);
            $table->index(['academic_session_id']);
        });

        Schema::create('application_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id');
            $table->enum('document_type', ['PASSPORT','OLEVEL_RESULT','JAMB_RESULT','BIRTH_CERTIFICATE','LGA_CERTIFICATE','NCE_CERTIFICATE','ND_CERTIFICATE','HND_CERTIFICATE','IJMB_RESULT','DEGREE_CERTIFICATE','JAMB_ADMISSION_LETTER','OTHER']);
            $table->string('original_file_name', 255)->nullable();
            $table->string('stored_file_name', 255);
            $table->string('storage_path', 500);
            $table->string('mime_type', 100)->nullable();
            $table->unsignedInteger('file_size')->nullable();
            $table->unsignedSmallInteger('version')->default(1);
            $table->enum('verification_status', ['PENDING','VERIFIED','REJECTED'])->default('PENDING');
            $table->uuid('verified_by_id')->nullable();
            $table->timestampTz('verified_at')->nullable();
            $table->timestampTz('uploaded_at')->useCurrent();
            $table->foreign('application_id')->references('id')->on('applications')->cascadeOnDelete();
            $table->unique(['application_id', 'document_type', 'version']);
        });

        Schema::create('jamb_results', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id')->unique();
            $table->string('registration_number', 100);
            $table->unsignedSmallInteger('examination_year');
            $table->unsignedSmallInteger('utme_score')->nullable();
            $table->string('institution_choice', 255)->nullable();
            $table->timestampsTz();
            $table->foreign('application_id')->references('id')->on('applications')->cascadeOnDelete();
        });

        Schema::create('jamb_subjects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('jamb_result_id');
            $table->string('subject', 100);
            $table->unsignedSmallInteger('score');
            $table->foreign('jamb_result_id')->references('id')->on('jamb_results')->cascadeOnDelete();
        });

        Schema::create('olevel_results', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id');
            $table->enum('examination_type', ['WAEC','NECO','NABTEB','NBAIS','OTHER']);
            $table->string('examination_number', 100);
            $table->unsignedSmallInteger('examination_year');
            $table->unsignedSmallInteger('sitting_number')->default(1);
            $table->timestampsTz();
            $table->foreign('application_id')->references('id')->on('applications')->cascadeOnDelete();
            $table->index(['application_id']);
        });

        Schema::create('olevel_subjects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('olevel_result_id');
            $table->string('subject', 100);
            $table->string('grade', 10);
            $table->foreign('olevel_result_id')->references('id')->on('olevel_results')->cascadeOnDelete();
        });

        Schema::create('application_qualifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id');
            $table->enum('qualification', ['NCE','ND','HND','IJMB','ALEVEL','DIPLOMA','DEGREE','OTHER']);
            $table->string('institution', 200);
            $table->string('certificate', 200)->nullable();
            $table->string('grade_class', 100)->nullable();
            $table->unsignedSmallInteger('year');
            $table->timestampsTz();
            $table->foreign('application_id')->references('id')->on('applications')->cascadeOnDelete();
        });

        Schema::create('application_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id');
            $table->string('reference', 150)->unique();
            $table->decimal('amount', 15, 2);
            $table->string('currency', 10)->default('NGN');
            $table->string('gateway', 50);
            $table->string('gateway_transaction_id', 200)->nullable();
            $table->string('rrr', 100)->nullable();              // Remita Retrieval Reference
            $table->enum('status', ['PENDING','PROCESSING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED','WAIVED'])->default('PENDING');
            $table->jsonb('gateway_response')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampsTz();
            $table->foreign('application_id')->references('id')->on('applications');
            $table->index(['status']);
        });

        // ── ADMISSIONS & STUDENTS ─────────────────────────────────────
        Schema::create('admissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('application_id')->unique();
            $table->string('admission_number', 100)->unique();
            $table->uuid('programme_id');
            $table->unsignedSmallInteger('level_value');
            $table->uuid('academic_session_id');
            $table->enum('status', ['OFFERED','ACCEPTED','DECLINED','WITHDRAWN'])->default('OFFERED');
            $table->timestampTz('offered_at')->useCurrent();
            $table->timestampTz('accepted_at')->nullable();
            $table->text('offer_conditions')->nullable();
            $table->timestampsTz();
            $table->foreign('application_id')->references('id')->on('applications');
            $table->foreign('programme_id')->references('id')->on('programmes');
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions');
        });

        Schema::create('students', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->unique();
            $table->string('matric_number', 100)->unique();
            $table->uuid('applicant_id')->nullable()->unique();
            $table->uuid('admission_id')->nullable()->unique();
            $table->uuid('current_programme_id');
            $table->unsignedSmallInteger('current_level_value');
            $table->enum('status', ['ACTIVE','SUSPENDED','DEFERRED','GRADUATED','WITHDRAWN','EXPELLED','DECEASED'])->default('ACTIVE');
            $table->enum('entry_type', ['UTME','DIRECT_ENTRY','TRANSFER','OTHER'])->default('UTME');
            $table->enum('student_type', ['FRESH','RETURNING'])->default('FRESH');
            $table->date('admission_date')->nullable();
            $table->date('graduation_date')->nullable();
            $table->timestampsTz();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('current_programme_id')->references('id')->on('programmes');
        });

        Schema::create('student_programmes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('programme_id');
            $table->unsignedSmallInteger('level_value');
            $table->uuid('academic_session_id');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->string('status', 30)->default('CURRENT');
            $table->timestampsTz();
            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
        });

        Schema::create('course_registrations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('semester_id');
            $table->enum('status', ['DRAFT','SUBMITTED','HOD_APPROVED','APPROVED','REJECTED'])->default('DRAFT');
            $table->unsignedSmallInteger('total_credit_units')->default(0);
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('approved_at')->nullable();
            $table->uuid('approved_by_id')->nullable();
            $table->timestampsTz();
            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
            $table->foreign('semester_id')->references('id')->on('semesters');
            $table->unique(['student_id', 'semester_id']);
        });

        Schema::create('course_registration_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('registration_id');
            $table->uuid('course_id');
            $table->unsignedSmallInteger('credit_units');
            $table->foreign('registration_id')->references('id')->on('course_registrations')->cascadeOnDelete();
            $table->foreign('course_id')->references('id')->on('courses');
            $table->unique(['registration_id', 'course_id']);
        });

        Schema::create('lecturers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->unique();
            $table->string('staff_number', 100)->unique();
            $table->uuid('department_id')->nullable();
            $table->string('designation', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('lecturer_courses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('lecturer_id');
            $table->uuid('course_id');
            $table->uuid('semester_id');
            $table->foreign('lecturer_id')->references('id')->on('lecturers')->cascadeOnDelete();
            $table->foreign('course_id')->references('id')->on('courses');
            $table->foreign('semester_id')->references('id')->on('semesters');
            $table->unique(['lecturer_id', 'course_id', 'semester_id']);
        });

        Schema::create('results', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('course_id');
            $table->uuid('semester_id');
            $table->decimal('ca_score', 5, 2)->nullable();
            $table->decimal('exam_score', 5, 2)->nullable();
            $table->decimal('total_score', 5, 2)->nullable();
            $table->string('grade', 5)->nullable();
            $table->decimal('grade_point', 4, 2)->nullable();
            $table->enum('status', ['DRAFT','SUBMITTED','HOD_REVIEWED','APPROVED','PUBLISHED','REJECTED'])->default('DRAFT');
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('approved_at')->nullable();
            $table->timestampTz('published_at')->nullable();
            $table->timestampsTz();
            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
            $table->foreign('course_id')->references('id')->on('courses');
            $table->foreign('semester_id')->references('id')->on('semesters');
            $table->unique(['student_id', 'course_id', 'semester_id']);
        });

        // ── FINANCE ───────────────────────────────────────────────────
        Schema::create('fee_structures', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('academic_session_id');
            $table->uuid('programme_id');
            $table->unsignedSmallInteger('level_value');
            $table->enum('student_type', ['FRESH','RETURNING'])->default('FRESH');
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions');
            $table->foreign('programme_id')->references('id')->on('programmes');
            $table->unique(['academic_session_id', 'programme_id', 'level_value', 'student_type']);
        });

        Schema::create('fee_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('fee_structure_id');
            $table->string('name', 150);
            $table->enum('category', ['TUITION','REGISTRATION','LIBRARY','ICT','EXAMINATION','DEVELOPMENT','MEDICAL','STUDENT_UNION','ACCEPTANCE','OTHER'])->default('OTHER');
            $table->decimal('amount', 15, 2);
            $table->boolean('is_mandatory')->default(true);
            $table->foreign('fee_structure_id')->references('id')->on('fee_structures')->cascadeOnDelete();
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('invoice_number', 100)->unique();
            $table->uuid('student_id');
            $table->string('invoice_type', 50);   // SCHOOL_FEES | ACCEPTANCE_FEE | REGISTRATION_FEE
            $table->uuid('academic_session_id');
            $table->decimal('total_amount', 15, 2);
            $table->decimal('amount_paid', 15, 2)->default(0);
            $table->decimal('balance', 15, 2);
            $table->enum('status', ['UNPAID','PARTIALLY_PAID','PAID','CANCELLED'])->default('UNPAID');
            $table->date('due_date')->nullable();
            $table->timestampsTz();
            $table->foreign('student_id')->references('id')->on('students');
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions');
            $table->index(['student_id']);
            $table->index(['status']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id');
            $table->uuid('student_id');
            $table->string('reference', 150)->unique();
            $table->decimal('amount', 15, 2);
            $table->string('currency', 10)->default('NGN');
            $table->string('gateway', 50);
            $table->string('gateway_transaction_id', 200)->nullable();
            $table->string('rrr', 100)->nullable()->index();     // Remita RRR
            $table->enum('status', ['PENDING','PROCESSING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED','WAIVED'])->default('PENDING');
            $table->jsonb('gateway_response')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampsTz();
            $table->foreign('invoice_id')->references('id')->on('invoices');
            $table->foreign('student_id')->references('id')->on('students');
            $table->index(['status']);
        });

        // ── COMMUNICATION ─────────────────────────────────────────────
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->enum('channel', ['EMAIL','SMS','IN_APP']);
            $table->string('subject', 200)->nullable();
            $table->text('body');
            $table->enum('status', ['PENDING','SENT','FAILED','READ'])->default('PENDING');
            $table->timestampTz('sent_at')->nullable();
            $table->timestampTz('read_at')->nullable();
            $table->jsonb('meta')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['user_id']);
        });

        Schema::create('news', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title', 200);
            $table->string('slug', 250)->unique();
            $table->text('content');
            $table->string('excerpt', 300)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('author_name', 150)->nullable();
            $table->enum('status', ['DRAFT','PUBLISHED','ARCHIVED'])->default('DRAFT');
            $table->timestampTz('published_at')->nullable();
            $table->timestampsTz();
            $table->index(['status']);
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title', 200);
            $table->text('message');
            $table->string('audience', 50)->default('ALL');
            $table->enum('status', ['DRAFT','PUBLISHED','ARCHIVED'])->default('PUBLISHED');
            $table->timestampTz('starts_at')->nullable();
            $table->timestampTz('ends_at')->nullable();
            $table->timestampsTz();
        });

        // ── SYSTEM ────────────────────────────────────────────────────
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->nullable();
            $table->string('action', 100);
            $table->string('entity_type', 100)->nullable();
            $table->string('entity_id', 100)->nullable();
            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->string('ip_address', 50)->nullable();
            $table->string('user_agent', 300)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['user_id']);
            $table->index(['action']);
        });

        Schema::create('system_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->jsonb('value');
            $table->timestampTz('updated_at')->nullable();
        });

        Schema::create('application_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('academic_session_id')->unique();
            $table->decimal('application_fee', 15, 2);
            $table->string('currency', 10)->default('NGN');
            $table->timestampTz('opens_at')->nullable();
            $table->timestampTz('closes_at')->nullable();
            $table->timestampTz('registration_closes_at')->nullable();  // second deadline (real AKCILS behaviour)
            $table->boolean('is_active')->default(true);
            $table->jsonb('allowed_types')->nullable();
            $table->timestampsTz();
            $table->foreign('academic_session_id')->references('id')->on('academic_sessions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_settings');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('announcements');
        Schema::dropIfExists('news');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('fee_items');
        Schema::dropIfExists('fee_structures');
        Schema::dropIfExists('results');
        Schema::dropIfExists('lecturer_courses');
        Schema::dropIfExists('lecturers');
        Schema::dropIfExists('course_registration_items');
        Schema::dropIfExists('course_registrations');
        Schema::dropIfExists('student_programmes');
        Schema::dropIfExists('students');
        Schema::dropIfExists('admissions');
        Schema::dropIfExists('application_payments');
        Schema::dropIfExists('application_qualifications');
        Schema::dropIfExists('olevel_subjects');
        Schema::dropIfExists('olevel_results');
        Schema::dropIfExists('jamb_subjects');
        Schema::dropIfExists('jamb_results');
        Schema::dropIfExists('application_documents');
        Schema::dropIfExists('applications');
        Schema::dropIfExists('applicants');
        Schema::dropIfExists('course_prerequisites');
        Schema::dropIfExists('courses');
        Schema::dropIfExists('programmes');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('faculties');
        Schema::dropIfExists('levels');
        Schema::dropIfExists('semesters');
        Schema::dropIfExists('academic_sessions');
        Schema::dropIfExists('staff_profiles');
        Schema::dropIfExists('user_role');
        Schema::dropIfExists('role_permission');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
        DB::statement("DO $$ BEGIN
            DROP TYPE student_type; DROP TYPE content_status; DROP TYPE notification_status;
            DROP TYPE notification_channel; DROP TYPE invoice_status; DROP TYPE fee_category;
            DROP TYPE result_status; DROP TYPE registration_status; DROP TYPE entry_type;
            DROP TYPE student_status; DROP TYPE admission_status; DROP TYPE payment_status;
            DROP TYPE application_status; DROP TYPE study_mode; DROP TYPE application_type;
            DROP TYPE gender; DROP TYPE course_status; DROP TYPE course_type;
            DROP TYPE programme_status; DROP TYPE semester_status; DROP TYPE semester_name;
            DROP TYPE session_status; DROP TYPE role_name; DROP TYPE user_status;
            DROP TYPE verification_status; DROP TYPE document_type; DROP TYPE olevel_exam_type;
            DROP TYPE qualification_type;
        EXCEPTION WHEN undefined_object THEN null; END $$;");
    }
};
