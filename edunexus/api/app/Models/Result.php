<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Result extends Model
{
    use HasUuids;

    protected $fillable = [
        'student_id', 'course_id', 'semester_id', 'ca_score', 'exam_score',
        'total_score', 'grade', 'grade_point', 'status',
        'submitted_at', 'approved_at', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'ca_score' => 'decimal:2',
            'exam_score' => 'decimal:2',
            'total_score' => 'decimal:2',
            'grade_point' => 'decimal:2',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function semester(): BelongsTo
    {
        return $this->belongsTo(Semester::class);
    }
}
