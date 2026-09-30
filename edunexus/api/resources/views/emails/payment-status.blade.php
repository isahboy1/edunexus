@component('mail::message')
Hello,

{{ $bodyText }}

This is an automated message from {{ config('app.name', 'EduNexus') }}.
You are receiving this email because you have an account on the portal.

Thanks,<br>
{{ config('app.name', 'EduNexus') }}
@endcomponent
