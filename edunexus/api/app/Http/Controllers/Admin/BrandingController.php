<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * White-label branding (SRS §58: routine changes must not need a developer).
 * One institution per deployment — a Super Admin sets the primary colour and
 * uploads the crest once, and every portal, public page and PDF re-skins.
 *
 *   branding  → SystemSetting key `branding`:
 *               { primary: "#7C3AED", accent: "#0D9488" }   (hex, editable)
 *   logo      → storage/app/public/branding/logo.<ext>, served through a
 *               controller so the file never has to live in the public folder.
 *
 * Colours are a single seed each: the Next.js side derives the full tint ramp
 * from the primary, so one pick re-skins the whole system.
 */
class BrandingController extends Controller
{
    private const HEX = '/^#([0-9a-f]{6})$/i';

    /** Default palette — mirrors the shipped design system in globals.css. */
    public const DEFAULT_BRANDING = [
        'primary' => '#2B6074',
        'accent' => '#2D684F',
    ];

    /**
     * GET /api/v1/admin/branding — current branding (staff, for the settings form).
     */
    public function show(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'REGISTRAR');

        return $this->ok($this->brandingPayload());
    }

    /**
     * PUT /api/v1/admin/branding — update brand colours.
     * Body: { primary: "#rrggbb", accent: "#rrggbb" } (either may be omitted).
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $data = $request->validate([
            'primary' => ['sometimes', 'string', 'regex:' . self::HEX],
            'accent' => ['sometimes', 'string', 'regex:' . self::HEX],
        ]);

        $current = $this->branding();
        $branding = array_merge($current, array_map('strtolower', $data));

        SystemSetting::updateOrCreate(
            ['key' => 'branding'],
            ['value' => $branding, 'updated_at' => now()]
        );

        $this->audit($user, 'BRANDING_UPDATED', 'SystemSetting', null, null, $data);

        return $this->ok($this->brandingPayload(), 'Brand colours saved.');
    }

    /**
     * POST /api/v1/admin/branding/logo — upload the institution crest/logo.
     * PNG, JPG, WEBP or SVG up to 2 MB. Stored under storage/app/public/branding.
     */
    public function uploadLogo(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $data = $request->validate([
            'logo' => ['required', 'file', 'image', 'mimes:png,jpg,jpeg,webp,svg', 'max:2048'],
        ]);

        $dir = 'branding';
        $path = $data['logo']->storeAs(
            $dir,
            'logo.' . strtolower($data['logo']->getClientOriginalExtension() ?: 'png'),
            'local'
        );

        $this->storeLogoPath($path);
        $this->audit($user, 'BRANDING_LOGO_UPLOADED', 'SystemSetting', null, null, ['path' => $path]);

        return $this->ok($this->brandingPayload(), 'Logo updated.');
    }

    /**
     * DELETE /api/v1/admin/branding/logo — revert to the bundled default logo.
     */
    public function deleteLogo(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'REGISTRAR');

        $old = $this->logoPath();
        if ($old !== null) {
            try {
                \Storage::disk('local')->delete($old);
            } catch (\Throwable $e) {
                // best effort — the pointer is cleared below regardless
            }
        }
        $this->storeLogoPath(null);
        $this->audit($user, 'BRANDING_LOGO_REMOVED', 'SystemSetting', null, null, []);

        return $this->ok($this->brandingPayload(), 'Default logo restored.');
    }

    /**
     * GET /api/v1/branding/logo — public logo stream with long-lived caching.
     * Falls back to the bundled /logo.png when no custom logo is set, so this
     * single URL is always renderable.
     */
    public function logoFile(Request $request)
    {
        $path = $this->logoPath();

        if ($path === null || ! \Storage::disk('local')->exists($path)) {
            return redirect('/logo.png', 302);
        }

        $mime = Str::of($path)->afterLast('.')->lower()->toString();
        $mimeMap = [
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
        ];

        return response(\Storage::disk('local')->get($path), 200, [
            'Content-Type' => $mimeMap[$mime] ?? 'application/octet-stream',
            'Cache-Control' => 'public, max-age=60',
        ]);
    }

    /* ── helpers ──────────────────────────────────────────────── */

    /** Branding row (defaults when unset), normalised to lowercase hex. */
    private function branding(): array
    {
        $row = SystemSetting::find('branding')?->value;

        return array_map(
            'strtolower',
            array_merge(self::DEFAULT_BRANDING, is_array($row) ? $row : [])
        );
    }

    /** JSON payload shared by every endpoint: colours + resolved logo URL. */
    private function brandingPayload(): array
    {
        $logoPath = $this->logoPath();

        return [
            'primary' => $this->branding()['primary'],
            'accent' => $this->branding()['accent'],
            'logoUrl' => ($logoPath !== null && \Storage::disk('local')->exists($logoPath))
                ? url('/api/v1/branding/logo')
                : null,
        ];
    }

    private function logoPath(): ?string
    {
        $inst = SystemSetting::find('institution')?->value;
        $path = is_array($inst) ? ($inst['logoPath'] ?? null) : null;

        return is_string($path) && $path !== '' ? $path : null;
    }

    private function storeLogoPath(?string $path): void
    {
        $inst = SystemSetting::find('institution')?->value;
        $value = is_array($inst) ? $inst : [];
        if ($path === null) {
            unset($value['logoPath']);
        } else {
            $value['logoPath'] = $path;
        }

        SystemSetting::updateOrCreate(
            ['key' => 'institution'],
            ['value' => $value, 'updated_at' => now()]
        );
    }
}
