<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationQualification extends Model
{
    use HasUuids;

    protected $fillable = [
        'application_id', 'qualification', 'institution',
        'certificate', 'grade_class', 'year',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }
}
