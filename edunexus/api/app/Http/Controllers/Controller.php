<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    use AuthorizesRequests;

    /**
     * Uniform audit entry for sensitive actions (SRS §45).
     */
    protected function audit(?User $user, string $action, string $entityType, ?string $entityId = null, ?array $old = null, ?array $new = null): void
    {
        AuditLog::create([
            'user_id' => $user?->id,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => request()->ip(),
            'user_agent' => substr((string) request()->userAgent(), 0, 300),
            'created_at' => now(),
        ]);
    }

    /**
     * Standard JSON success envelope.
     */
    protected function ok(mixed $data = null, ?string $message = null, int $status = 200): JsonResponse
    {
        return response()->json([
            'ok' => true,
            ...(isset($message) ? ['message' => $message] : []),
            'data' => $data,
        ], $status);
    }

    /**
     * Authorise a staff action via role names (SRS RBAC).
     */
    protected function authorizeRoles(User $user, string ...$roles): void
    {
        if (! $user->hasRole(...$roles)) {
            abort(403, 'You do not have permission to perform this action.');
        }
    }

    /**
     * Ensure the authenticated user owns the given model (applicant scoping).
     */
    protected function authorizeOwnership(User $user, Model $model, string $relation = 'applicant_id'): void
    {
        $applicantId = $user->applicant?->id;
        if (! $applicantId || $model->{$relation} !== $applicantId) {
            abort(403, 'This record does not belong to you.');
        }
    }
}
