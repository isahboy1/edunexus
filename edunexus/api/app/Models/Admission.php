<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Admission extends Model
{
    use HasUuids;

    protected $fillable = [
        'application_id', 'admission_number', 'programme_id', 'level_value',
        'academic_session_id', 'status', 'offered_at', 'accepted_at', 'offer_conditions',
    ];

    protected function casts(): array
    {
        return ['offered_at' => 'datetime', 'accepted_at' => 'datetime'];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function academicSession(): BelongsTo
    {
        return $this->belongsTo(AcademicSession::class);
    }

    public function student(): HasOne
    {
        return $this->hasOne(Student::class);
    }
}
