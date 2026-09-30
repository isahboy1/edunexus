<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Shared per-user notification feed (SRS §35) for every signed-in portal:
 *  - personal rows (user_id = me), e.g. "your payment was confirmed";
 *  - staff broadcasts (audience = STAFF, shared row) for staff accounts,
 *    e.g. "payment awaiting confirmation" in the bursary bell.
 * Unread = rows still in status SENT. Marking read flips personal rows for
 * this user and the shared STAFF row for everyone.
 */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isStaff = $user->isStaff();

        $notifications = Notification::where('channel', 'IN_APP')
            ->where(function ($outer) use ($user, $isStaff) {
                $outer->where('user_id', $user->id);
                if ($isStaff) {
                    $outer->orWhere(fn ($w) => $w->where('audience', 'STAFF')->whereNull('user_id'));
                }
            })
            ->orderByDesc('created_at')
            ->limit(15)
            ->get();

        return $this->ok([
            'unread' => $notifications->where('status', 'SENT')->count(),
            'notifications' => $notifications->map(fn (Notification $n) => [
                'id' => $n->id,
                'subject' => $n->subject,
                'body' => $n->body,
                'status' => $n->status,
                'audience' => $n->audience,
                'createdAt' => $n->created_at?->toIso8601String(),
                'readAt' => $n->read_at?->toIso8601String(),
                'meta' => $n->meta,
            ]),
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $user = $request->user();

        Notification::where('channel', 'IN_APP')
            ->where('status', 'SENT')
            ->where(function ($outer) use ($user) {
                $outer->where('user_id', $user->id)
                    ->when($user->isStaff(), fn ($q) => $q->orWhere(fn ($w) => $w->where('audience', 'STAFF')->whereNull('user_id')));
            })
            ->update(['status' => 'READ', 'read_at' => now()]);

        return $this->ok(null, 'All notifications marked as read.');
    }
}
