<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Application extends Model
{
    use HasUuids;

    protected $fillable = [
        'application_number', 'applicant_id', 'academic_session_id', 'programme_id',
        'application_type', 'study_mode', 'entry_level_value', 'status', 'payment_status',
        'permanent_address', 'current_address', 'emergency_contact_name', 'emergency_contact_phone',
        'emergency_contact_address', 'marital_status', 'religion',
        'submitted_at', 'reviewed_at', 'review_comments', 'decided_at', 'decision_comments',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function applicant(): BelongsTo
    {
        return $this->belongsTo(Applicant::class);
    }

    public function academicSession(): BelongsTo
    {
        return $this->belongsTo(AcademicSession::class);
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(ApplicationDocument::class);
    }

    public function jambResult(): HasOne
    {
        return $this->hasOne(JambResult::class);
    }

    public function olevelResults(): HasMany
    {
        return $this->hasMany(OlevelResult::class);
    }

    public function qualifications(): HasMany
    {
        return $this->hasMany(ApplicationQualification::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(ApplicationPayment::class);
    }

    public function admission(): HasOne
    {
        return $this->hasOne(Admission::class);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['DRAFT', 'PAYMENT_PENDING', 'PAID'], true);
    }

    public function isReviewable(): bool
    {
        return in_array($this->status, ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SCREENING'], true);
    }

    public function hasSuccessfulPayment(): bool
    {
        return $this->payments()->where('status', 'SUCCESSFUL')->exists();
    }

    /**
     * Scope: applications still missing submission requirements (fee, contact
     * details, O'Level, required docs, JAMB/qualifications by type) — mirrors
     * AdmissionService::checkSubmissionReadiness so queue filters, the wizard
     * and the review page all agree.
     */
    public function scopeIncomplete($query)
    {
        return $query->where(function ($q) {
            // Fee unpaid
            $q->whereDoesntHave('payments', fn ($p) => $p->where('status', 'SUCCESSFUL'))
                // Contact details incomplete
                ->orWhere(fn ($c) => $c
                    ->whereNull('permanent_address')
                    ->orWhereNull('current_address'))
                // No O'Level sitting with subjects
                ->orWhereDoesntHave('olevelResults', fn ($o) => $o->has('subjects'))
                // Missing a required document (PASSPORT or OLEVEL_RESULT)
                ->orWhere(function ($d) {
                    $d->whereDoesntHave('documents', fn ($x) => $x->where('document_type', 'PASSPORT'))
                        ->orWhereDoesntHave('documents', fn ($x) => $x->where('document_type', 'OLEVEL_RESULT'));
                })
                // JAMB required for UTME
                ->orWhere(function ($t) {
                    $t->where('application_type', 'UTME')->whereDoesntHave('jambResult');
                })
                // Qualifications required for Direct Entry
                ->orWhere(function ($de) {
                    $de->where('application_type', 'DIRECT_ENTRY')->whereDoesntHave('qualifications');
                });
        });
    }
}
