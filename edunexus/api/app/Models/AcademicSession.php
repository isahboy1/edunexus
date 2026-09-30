<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AcademicSession extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'start_date', 'end_date', 'is_current', 'status'];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'is_current' => 'boolean',
        ];
    }

    public function semesters(): HasMany
    {
        return $this->hasMany(Semester::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(Application::class);
    }

    public function admissions(): HasMany
    {
        return $this->hasMany(Admission::class);
    }

    public function applicationSetting(): HasOne
    {
        return $this->hasOne(ApplicationSetting::class);
    }

    public static function current(): ?self
    {
        return static::where('is_current', true)->first();
    }
}
