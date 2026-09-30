<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Applicant extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id', 'application_number', 'surname', 'first_name', 'middle_name',
        'date_of_birth', 'gender', 'nationality', 'state_of_origin', 'lga', 'address',
        'passport_document_id',
    ];

    protected function casts(): array
    {
        return ['date_of_birth' => 'date'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(Application::class);
    }

    public function student(): HasOne
    {
        return $this->hasOne(Student::class);
    }
}
