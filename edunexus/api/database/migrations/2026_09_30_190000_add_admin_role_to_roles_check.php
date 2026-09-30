<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * RoleName.ADMIN exists in the application layer (canManageUsers, the sub-admin
 * role, DemoAccountsSeeder) but was missing from the `roles.name` CHECK
 * constraint created in 2026_09_23_000001_create_edunexus_core_schema, so
 * fresh databases (CI) rejected the seeder with:
 *   SQLSTATE[23514]: new row for relation "roles" violates check constraint
 *   "roles_name_check"
 * Postgres cannot ALTER a CHECK constraint, so drop and re-create it with the
 * full role list.
 */
return new class extends Migration
{
    private const ROLES = [
        'SUPER_ADMIN',
        'ADMIN',
        'REGISTRAR',
        'ADMISSIONS_OFFICER',
        'ACADEMIC_OFFICER',
        'BURSARY_OFFICER',
        'HOD',
        'LECTURER',
        'STUDENT',
        'APPLICANT',
    ];

    public function up(): void
    {
        DB::statement('ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check');
        $values = implode(',', array_map(fn ($r) => "'$r'", self::ROLES));
        DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ($values))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check');
        $values = implode(',', array_map(fn ($r) => "'$r'", array_diff(self::ROLES, ['ADMIN'])));
        DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ($values))");
    }
};
