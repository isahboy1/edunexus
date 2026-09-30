<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationSetting extends Model
{
    use HasUuids;

    protected $fillable = [
        'academic_session_id', 'application_fee', 'currency',
        'opens_at', 'closes_at', 'registration_closes_at', 'is_active', 'allowed_types',
    ];

    protected function casts(): array
    {
        return [
            'application_fee' => 'decimal:2',
            'opens_at' => 'datetime',
            'closes_at' => 'datetime',
            'registration_closes_at' => 'datetime',
            'is_active' => 'boolean',
            'allowed_types' => 'array',
        ];
    }

    public function academicSession(): BelongsTo
    {
        return $this->belongsTo(AcademicSession::class);
    }

    public function applicationOpen(): bool
    {
        if (! $this->is_active) return false;
        $now = now();
        if ($this->opens_at && $this->opens_at->isFuture()) return false;
        if ($this->closes_at && $this->closes_at->isPast()) return false;
        return true;
    }

    public function registrationOpen(): bool
    {
        if (! $this->is_active) return false;
        $now = now();
        if ($this->opens_at && $this->opens_at->isFuture()) return false;
        if ($this->registration_closes_at && $this->registration_closes_at->isPast()) return false;
        return true;
    }
}
