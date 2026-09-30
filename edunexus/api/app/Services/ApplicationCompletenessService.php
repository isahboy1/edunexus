<?php

namespace App\Services;

use App\Models\Application;

/**
 * ApplicationCompletenessService — per-section readiness for the application
 * wizard. Section keys mirror the wizard stages (payment / personal / contact
 * / olevel / jamb / qualifications / documents) so the UI can attach
 * missing-field hints directly, while `problems` reuses
 * AdmissionService::checkSubmissionReadiness so the hints always match the
 * actual submission gate.
 */
class ApplicationCompletenessService
{
    public function __construct(private AdmissionService $admissions)
    {
    }

    /**
     * @return array{ready: bool, sections: array<int, array{key: string, label: string, complete: bool, missing: string[]}>, problems: string[]}
     */
    public function describe(Application $application): array
    {
        $application->loadMissing([
            'applicant.user', 'olevelResults.subjects', 'documents',
            'jambResult', 'qualifications', 'payments',
        ]);
        $applicant = $application->applicant;

        // Bio data — applicant profile fields (mirrors wizard stage 2).
        $personalMissing = [];
        foreach ([
            'Surname' => $applicant?->surname,
            'First name' => $applicant?->first_name,
            'Date of birth' => $applicant?->date_of_birth,
            'Gender' => $applicant?->gender,
            'Nationality' => $applicant?->nationality,
            'State of origin' => $applicant?->state_of_origin,
            'Residential address' => $applicant?->address,
            'Phone number' => $applicant?->user?->phone,
        ] as $label => $value) {
            if (empty($value)) {
                $personalMissing[] = $label;
            }
        }

        // Contact details (application-level).
        $contactMissing = [];
        foreach ([
            'Permanent address' => $application->permanent_address,
            'Current address' => $application->current_address,
            'Emergency contact name' => $application->emergency_contact_name,
            'Emergency contact phone' => $application->emergency_contact_phone,
        ] as $label => $value) {
            if (empty($value)) {
                $contactMissing[] = $label;
            }
        }

        // O'Level — at least one sitting that actually has subjects.
        $hasSitting = $application->olevelResults->contains(fn ($r) => $r->subjects->isNotEmpty());
        $olevelMissing = $hasSitting ? [] : ["At least one O'Level sitting with subjects"];

        // JAMB — only mandatory for UTME applications.
        $jambMissing = [];
        if ($application->application_type === 'UTME' && ! $application->jambResult) {
            $jambMissing[] = 'JAMB registration details (required for UTME)';
        }

        // Direct Entry — previous qualifications.
        $qualsMissing = [];
        if ($application->application_type === 'DIRECT_ENTRY' && $application->qualifications->isEmpty()) {
            $qualsMissing[] = 'At least one previous qualification (required for Direct Entry)';
        }

        // Required documents.
        $present = $application->documents->pluck('document_type')->all();
        $docsMissing = [];
        foreach (['PASSPORT' => 'Passport photograph', 'OLEVEL_RESULT' => "O'Level result"] as $type => $label) {
            if (! in_array($type, $present, true)) {
                $docsMissing[] = $label;
            }
        }

        $paid = $application->hasSuccessfulPayment();

        $sections = [
            [
                'key' => 'payment', 'label' => 'Application fee',
                'complete' => $paid, 'missing' => $paid ? [] : ['Fee not paid'],
            ],
            [
                'key' => 'personal', 'label' => 'Bio data',
                'complete' => $personalMissing === [], 'missing' => $personalMissing,
            ],
            [
                'key' => 'contact', 'label' => 'Contact details',
                'complete' => $contactMissing === [], 'missing' => $contactMissing,
            ],
            [
                'key' => 'olevel', 'label' => "O'Level results",
                'complete' => $olevelMissing === [], 'missing' => $olevelMissing,
            ],
            [
                'key' => 'jamb', 'label' => 'JAMB details',
                'complete' => $jambMissing === [], 'missing' => $jambMissing,
            ],
            [
                'key' => 'qualifications', 'label' => 'Previous qualifications',
                'complete' => $qualsMissing === [], 'missing' => $qualsMissing,
            ],
            [
                'key' => 'documents', 'label' => 'Required documents',
                'complete' => $docsMissing === [], 'missing' => $docsMissing,
            ],
        ];

        $problems = $this->admissions->checkSubmissionReadiness($application);

        return [
            'ready' => $problems === [],
            'sections' => $sections,
            'problems' => $problems,
        ];
    }
}
