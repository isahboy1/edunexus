<?php

namespace App\Http\Controllers\Applicant;

use App\Http\Controllers\Controller;
use App\Models\ApplicationDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentController extends Controller
{
    private const ALLOWED_MIMES = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
    ];

    private const MAX_SIZE_KB = 2048; // SRS §12: validate file size

    /** GET /api/v1/applicant/applications/{id}/documents */
    public function index(Request $request, string $id): JsonResponse
    {
        $application = \App\Models\Application::findOrFail($id);
        $this->authorizeOwnership($request->user(), $application);

        return $this->ok(
            $application->documents()->orderByDesc('uploaded_at')->get()->map(fn ($d) => $this->present($d))
        );
    }

    /**
     * POST /api/v1/applicant/applications/{id}/documents
     * multipart: document (file), documentType, replacesVersion (optional)
     * Files are validated, renamed securely and stored OUTSIDE the web root
     * on the private disk (SRS §12).
     */
    public function store(Request $request, string $id): JsonResponse
    {
        $application = \App\Models\Application::findOrFail($id);
        $this->authorizeOwnership($request->user(), $application);
        abort_unless($application->isEditable(), 422, 'Application is locked; documents can no longer be uploaded.');

        $data = $request->validate([
            'documentType' => ['required', 'string'],
            'document' => ['required', 'file', 'max:'.self::MAX_SIZE_KB],
        ]);
        if (! array_key_exists($request->file('document')->getMimeType(), self::ALLOWED_MIMES)) {
            return response()->json([
                'ok' => false,
                'message' => 'Unsupported file type. Allowed: PDF, JPG, PNG.',
            ], 422);
        }

        $file = $request->file('document');
        $ext = self::ALLOWED_MIMES[$file->getMimeType()];

        // Secure random name — never trust the original file name
        $stored = Str::uuid()->toString().'.'.$ext;

        $latest = $application->documents()
            ->where('document_type', $data['documentType'])
            ->orderByDesc('version')
            ->first();

        $doc = $application->documents()->create([
            'document_type' => $data['documentType'],
            'original_file_name' => $file->getClientOriginalName(),
            'stored_file_name' => $stored,
            'storage_path' => 'documents/'.$stored,
            'mime_type' => $file->getMimeType(),
            'file_size' => $file->getSize(),
            'version' => ($latest?->version ?? 0) + 1,
            'verification_status' => 'PENDING',
            'uploaded_at' => now(),
        ]);

        Storage::disk('private')->putFileAs('documents', $file, $stored);

        $this->audit($request->user(), 'DOCUMENT_UPLOADED', 'ApplicationDocument', $doc->id);

        return $this->ok($this->present($doc), 'Document uploaded.', 201);
    }

    /**
     * DELETE /api/v1/applicant/applications/{id}/documents/{docId} —
     * remove a document before submission (SRS: applicants may replace uploads).
     */
    public function destroy(Request $request, string $id, string $docId): JsonResponse
    {
        $application = \App\Models\Application::findOrFail($id);
        $this->authorizeOwnership($request->user(), $application);
        abort_unless($application->isEditable(), 422, 'Application is locked; documents can no longer be removed.');

        $doc = ApplicationDocument::where('application_id', $id)->findOrFail($docId);
        $doc->delete();
        $this->audit($request->user(), 'DOCUMENT_DELETED', 'ApplicationDocument', $docId);

        return $this->ok(null, 'Document removed.');
    }

    /**
     * GET /api/v1/applicant/applications/{id}/documents/{docId}/download —
     * streamed from the private disk, never a public URL.
     */
    public function download(Request $request, string $id, string $docId): \Symfony\Component\HttpFoundation\Response
    {
        $application = \App\Models\Application::findOrFail($id);
        $this->authorizeOwnership($request->user(), $application);

        $doc = ApplicationDocument::where('application_id', $id)->findOrFail($docId);
        abort_unless(Storage::disk('private')->exists($doc->storage_path), 404, 'File missing.');

        return Storage::disk('private')->download($doc->storage_path, $doc->original_file_name ?: $doc->stored_file_name);
    }

    private function present(ApplicationDocument $d): array
    {
        return [
            'id' => $d->id,
            'documentType' => $d->document_type,
            'originalFileName' => $d->original_file_name,
            'mimeType' => $d->mime_type,
            'fileSize' => $d->file_size,
            'version' => $d->version,
            'verificationStatus' => $d->verification_status,
            'uploadedAt' => $d->uploaded_at?->toIso8601String(),
        ];
    }
}
