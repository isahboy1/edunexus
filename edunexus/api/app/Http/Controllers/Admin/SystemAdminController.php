<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ApplicationSetting;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class SystemAdminController extends Controller
{
    /**
     * GET /api/v1/admin/settings — institution settings + admission window.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR');

        $window = ApplicationSetting::with('academicSession')->orderByDesc('created_at')->get();

        return $this->ok([
            'system' => SystemSetting::orderBy('key')->get()->pluck('value', 'key'),
            'admissionWindows' => $window,
        ]);
    }

    /**
     * GET /api/v1/public/settings — institution identity for public pages,
     * acknowledgement slips and PDFs (no auth required). Includes the
     * white-label branding (colours + logo URL) so every surface can re-skin.
     */
    public function publicSettings(Request $request): JsonResponse
    {
        $defaults = [
            'name' => 'EduNexus College',
            'shortName' => 'EduNexus',
            'domain' => 'edunexus.edu.ng',
            'address' => 'BUK Road, Kano, Kano State',
            'email' => 'info@edunexus.edu.ng',
            'phone' => '+234 800 000 0000',
            'matricPrefix' => 'EDU',
            'admissionPrefix' => 'EDU/ADM',
        ];
        $institution = SystemSetting::find('institution')?->value;
        $merged = array_merge($defaults, is_array($institution) ? $institution : []);

        // White-label branding: seed colours + resolved logo URL (never the
        // internal storage path). Defaults mirror the shipped design system.
        $brandingRow = SystemSetting::find('branding')?->value;
        $branding = array_merge(
            \App\Http\Controllers\Admin\BrandingController::DEFAULT_BRANDING,
            is_array($brandingRow) ? $brandingRow : []
        );
        $logoPath = $merged['logoPath'] ?? null;
        unset($merged['logoPath']);
        $merged['branding'] = [
            'primary' => $branding['primary'],
            'accent' => $branding['accent'],
            'logoUrl' => (is_string($logoPath) && $logoPath !== ''
                && \Storage::disk('local')->exists($logoPath))
                ? url('/api/v1/branding/logo')
                : null,
        ];

        return $this->ok($merged);
    }

    /**
     * PUT /api/v1/admin/settings — update institution key/values.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*' => ['required'],
        ]);

        foreach ($data['settings'] as $key => $value) {
            // The institution row also carries internal pointers (logoPath)
            // managed by dedicated endpoints — merge identity saves over the
            // stored value instead of replacing it wholesale.
            $existing = SystemSetting::find(substr($key, 0, 100));
            if ($key === 'institution' && $existing && is_array($existing->value) && is_array($value)) {
                $value = array_merge($existing->value, $value);
            }

            SystemSetting::updateOrCreate(
                ['key' => substr($key, 0, 100)],
                ['value' => $value, 'updated_at' => now()]
            );
        }

        $this->audit($user, 'SETTINGS_UPDATED', 'SystemSetting', null, null, $data['settings']);

        return $this->ok(SystemSetting::orderBy('key')->get()->pluck('value', 'key'), 'Settings saved.');
    }

    /**
     * PUT /api/v1/admin/admission-windows/{id} — configure the admission
     * window: fee, deadlines (application + registration), allowed types.
     * The ₦5,500 default is data, never hard-coded (SRS §13).
     */
    public function updateAdmissionWindow(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $window = ApplicationSetting::findOrFail($id);

        $data = $request->validate([
            'applicationFee' => ['sometimes', 'numeric', 'min:0'],
            'opensAt' => ['nullable', 'date'],
            'closesAt' => ['nullable', 'date', 'after:opensAt'],
            'registrationClosesAt' => ['nullable', 'date', 'after:closesAt'],
            'isActive' => ['sometimes', 'boolean'],
            'allowedTypes' => ['sometimes', 'array'],
        ]);

        $old = $window->toArray();
        $window->application_fee = $data['applicationFee'] ?? $window->application_fee;
        if (array_key_exists('opensAt', $data)) $window->opens_at = $data['opensAt'];
        if (array_key_exists('closesAt', $data)) $window->closes_at = $data['closesAt'];
        if (array_key_exists('registrationClosesAt', $data)) $window->registration_closes_at = $data['registrationClosesAt'];
        if (array_key_exists('isActive', $data)) $window->is_active = (bool) $data['isActive'];
        if (array_key_exists('allowedTypes', $data)) $window->allowed_types = $data['allowedTypes'];
        $window->save();

        $this->audit($user, 'ADMISSION_WINDOW_UPDATED', 'ApplicationSetting', $window->id, $old, $window->fresh()->toArray());

        return $this->ok($window->fresh()->load('academicSession'), 'Admission window saved.');
    }

    /**
     * GET /api/v1/admin/audit-logs — immutable viewer, filterable (SRS §45).
     */
    public function auditLogs(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR');

        $q = AuditLog::with('user:id,name,email')->orderByDesc('created_at');

        if ($request->filled('action')) {
            $q->where('action', 'like', '%'.strtoupper($request->string('action')).'%');
        }
        if ($request->filled('userId')) {
            $q->where('user_id', $request->string('userId'));
        }

        return $this->ok($q->paginate((int) $request->query('perPage', '50')));
    }

    /**
     * POST /api/v1/admin/users — create staff accounts.
     * SUPER_ADMIN: any role. ADMIN (sub-admin): non-privileged roles only.
     */
    public function createUser(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeRoles($actor, 'SUPER_ADMIN', 'ADMIN');

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::exists('roles', 'name')],
            'staffNo' => ['nullable', 'string', 'max:100'],
            'office' => ['nullable', 'string', 'max:150'],
        ]);

        // Privilege-escalation guard: sub-admins may only mint non-privileged roles.
        $isSubAdmin = count($actor->roleNames()) === 1 && $actor->hasRole('ADMIN');
        $assignable = ['ADMISSIONS_OFFICER', 'ACADEMIC_OFFICER', 'BURSARY_OFFICER', 'HOD', 'LECTURER'];
        if ($isSubAdmin && ! in_array($data['role'], $assignable, true)) {
            abort(403, 'You do not have permission to create this role.');
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'status' => 'ACTIVE',
            'email_verified_at' => now(),
        ]);

        $user->roles()->attach(Role::where('name', $data['role'])->value('id'));

        if (! empty($data['staffNo']) || ! empty($data['office'])) {
            StaffProfile::create([
                'user_id' => $user->id,
                'staff_no' => $data['staffNo'] ?? null,
                'office' => $data['office'] ?? null,
            ]);
        }

        $this->audit($actor, 'USER_CREATED', 'User', $user->id, null, ['role' => $data['role']]);

        return $this->ok(['id' => $user->id, 'email' => $user->email, 'role' => $data['role']], 'Staff user created.', 201);
    }

    /** GET /api/v1/admin/users — user directory.
     * Sub-admins only see non-privileged accounts (their scope of work). */
    public function listUsers(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeRoles($actor, 'SUPER_ADMIN', 'ADMIN', 'REGISTRAR');

        $isSubAdmin = count($actor->roleNames()) === 1 && $actor->hasRole('ADMIN');
        $protected = ['SUPER_ADMIN', 'ADMIN', 'REGISTRAR'];

        $users = User::with('roles:id,name')->orderBy('name')
            ->when($request->filled('role'), fn ($q) => $q->whereHas('roles', fn ($r) => $r->where('name', $request->string('role')->upper())))
            ->when($isSubAdmin, fn ($q) => $q->whereDoesntHave('roles', fn ($r) => $r->whereIn('name', $protected)))
            ->paginate((int) $request->query('perPage', '50'));

        return $this->ok($users);
    }

    /**
     * POST /api/v1/admin/users/{id}/reset-password — set a new password.
     * SUPER_ADMIN: any account. ADMIN (sub-admin): non-privileged accounts
     * only, never SUPER_ADMIN/ADMIN/REGISTRAR and never their own.
     */
    public function resetPassword(Request $request, string $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeRoles($actor, 'SUPER_ADMIN', 'ADMIN');

        $data = $request->validate([
            'newPassword' => ['required', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
        ]);

        $target = User::with('roles:id,name')->findOrFail($id);

        if ($target->id === $actor->id) {
            return response()->json([
                'ok' => false,
                'message' => 'You cannot reset your own password here.',
                'errors' => ['form' => ['You cannot reset your own password here.']],
            ], 422);
        }

        $isSubAdmin = count($actor->roleNames()) === 1 && $actor->hasRole('ADMIN');
        if ($isSubAdmin && $target->hasRole('SUPER_ADMIN', 'ADMIN', 'REGISTRAR')) {
            abort(403, 'You do not have permission to perform this action.');
        }

        $target->password = $data['newPassword']; // hashed cast
        $target->failed_logins = 0;
        $target->locked_until = null;
        $target->save();

        $this->audit($actor, 'PASSWORD_RESET', 'User', $target->id, null, ['email' => $target->email]);

        return $this->ok(['reset' => true], 'Password reset. Share it with the user securely.');
    }
}
