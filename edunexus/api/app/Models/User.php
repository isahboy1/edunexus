<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    protected $fillable = [
        'name', 'email', 'phone', 'password', 'status', 'failed_logins', 'locked_until', 'last_login_at',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'status' => 'string',
        ];
    }

    // ── RBAC ─────────────────────────────────────────────────────
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_role', 'user_id', 'role_id');
    }

    public function hasRole(string ...$names): bool
    {
        return $this->roles()->whereIn('name', $names)->exists();
    }

    public function roleNames(): array
    {
        return $this->roles->pluck('name')->all();
    }

    public function isStaff(): bool
    {
        return $this->hasRole('SUPER_ADMIN', 'ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER', 'ACADEMIC_OFFICER', 'BURSARY_OFFICER', 'HOD');
    }

    // ── Profiles ─────────────────────────────────────────────────
    public function applicant(): HasOne
    {
        return $this->hasOne(Applicant::class);
    }

    public function student(): HasOne
    {
        return $this->hasOne(Student::class);
    }

    public function lecturer(): HasOne
    {
        return $this->hasOne(Lecturer::class);
    }

    public function staffProfile(): HasOne
    {
        return $this->hasOne(StaffProfile::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    // ── Account lockout (SRS §44) ────────────────────────────────
    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    public function registerFailedLogin(int $maxAttempts = 5, int $lockMinutes = 15): void
    {
        $this->failed_logins += 1;
        $this->locked_until = $this->failed_logins >= $maxAttempts
            ? now()->addMinutes($lockMinutes)
            : null;
        $this->save();
    }

    public function registerSuccessfulLogin(): void
    {
        $this->failed_logins = 0;
        $this->locked_until = null;
        $this->last_login_at = now();
        $this->save();
    }
}
