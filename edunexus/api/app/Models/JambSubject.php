<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JambSubject extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['jamb_result_id', 'subject', 'score'];

    public function jambResult(): BelongsTo
    {
        return $this->belongsTo(JambResult::class);
    }
}
