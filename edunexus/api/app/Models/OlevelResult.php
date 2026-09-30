<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OlevelResult extends Model
{
    use HasUuids;

    protected $fillable = [
        'application_id', 'examination_type', 'examination_number',
        'examination_year', 'sitting_number',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(OlevelSubject::class);
    }
}
