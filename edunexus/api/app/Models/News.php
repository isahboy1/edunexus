<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class News extends Model
{
    use HasUuids;

    protected $table = 'news';

    protected $fillable = [
        'title', 'slug', 'content', 'excerpt', 'image_url',
        'author_name', 'status', 'published_at',
    ];

    protected function casts(): array
    {
        return ['published_at' => 'datetime'];
    }

    public function scopePublished($query)
    {
        return $query->where('status', 'PUBLISHED')->orderByDesc('published_at');
    }
}
