<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationPayment extends Model
{
    use HasUuids;

    /** The relation FK is application_id (not the inferred application_payment_id). */
    protected $foreignKey = 'application_id';

    protected $fillable = [
        'application_id', 'reference', 'amount', 'currency', 'gateway',
        'gateway_transaction_id', 'rrr', 'status', 'gateway_response', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'gateway_response' => 'array',
            'paid_at' => 'datetime',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function scopeSuccessful($query)
    {
        return $query->where('status', 'SUCCESSFUL');
    }
}
