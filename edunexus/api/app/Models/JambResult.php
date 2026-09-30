<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JambResult extends Model
{
    use HasUuids;

    protected $fillable = [
        'application_id', 'registration_number', 'examination_year',
        'utme_score', 'institution_choice',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(JambSubject::class);
    }
}
