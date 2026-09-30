<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApplicationDocument extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'application_id', 'document_type', 'original_file_name', 'stored_file_name',
        'storage_path', 'mime_type', 'file_size', 'version', 'verification_status',
        'verified_by_id', 'verified_at', 'uploaded_at',
    ];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'uploaded_at' => 'datetime'];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by_id');
    }
}
