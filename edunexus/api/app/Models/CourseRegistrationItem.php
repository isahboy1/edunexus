<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseRegistrationItem extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['registration_id', 'course_id', 'credit_units'];

    public function registration(): BelongsTo
    {
        return $this->belongsTo(CourseRegistration::class, 'registration_id');
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
