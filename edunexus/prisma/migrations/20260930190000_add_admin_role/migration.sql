-- RoleName.ADMIN exists in schema.prisma (the sub-admin role used by
-- canManageUsers / DemoAccountsSeeder) but was never captured by a migration,
-- so fresh databases (CI) rejected the seeder with
-- `Invalid input value for enum "RoleName": "ADMIN"`.
-- Idempotent: databases that already gained the value manually are unaffected.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'ADMIN' AFTER 'SUPER_ADMIN';
