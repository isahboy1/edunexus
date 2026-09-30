<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';
    protected $primaryKey = 'key';
    public $timestamps = false;

    protected $fillable = ['key', 'value', 'updated_at'];

    protected function casts(): array
    {
        return ['value' => 'array', 'updated_at' => 'datetime'];
    }
}
