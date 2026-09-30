<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Student extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id', 'matric_number', 'applicant_id', 'admission_id',
        'current_programme_id', 'current_level_value', 'status', 'entry_type',
        'student_type', 'admission_date', 'graduation_date',
    ];

    protected function casts(): array
    {
        return ['admission_date' => 'date', 'graduation_date' => 'date'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function currentProgramme(): BelongsTo
    {
        return $this->belongsTo(Programme::class, 'current_programme_id');
    }

    public function admission(): HasOne
    {
        return $this->hasOne(Admission::class, 'id', 'admission_id');
    }

    public function programmeHistory(): HasMany
    {
        return $this->hasMany(StudentProgramme::class);
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(CourseRegistration::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function results(): HasMany
    {
        return $this->hasMany(Result::class);
    }

    public function outstandingBalance(): float
    {
        return (float) $this->invoices()
            ->where('status', '!=', 'CANCELLED')
            ->sum('balance');
    }
}
