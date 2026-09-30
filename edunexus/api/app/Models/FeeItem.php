<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeeItem extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['fee_structure_id', 'name', 'category', 'amount', 'is_mandatory'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'is_mandatory' => 'boolean'];
    }

    public function feeStructure(): BelongsTo
    {
        return $this->belongsTo(FeeStructure::class);
    }
}
