<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OlevelSubject extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['olevel_result_id', 'subject', 'grade'];

    public function olevelResult(): BelongsTo
    {
        return $this->belongsTo(OlevelResult::class);
    }
}
