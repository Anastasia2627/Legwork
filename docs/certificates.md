# Course completion certificates

This feature issues a PDF certificate after **teacher-verified** completion of an enrolled Guru course. Certificates are not professional credentials or an accreditation.

## Student flow

- Enroll in the Guru package.
- Finish every lesson in the course, submit a homework link, and obtain written feedback and explicit instructor approval for every lesson.
- Check the Achievements tab for completed/submitted/approved counts.
- After a school administrator issues the certificate, download the PDF in the Achievements tab. A shared verification link validates the certificate reference without granting PDF download to the public.

## Admin workflow

- In Admin Studio, review each submitted homework video link.
- Write feedback, then separately click **Approve homework** once the submitted work is accepted. Simply writing feedback does not approve it.
- Changing the student's homework link, unmarking a lesson completed, or rewriting teacher feedback resets its approval.
- Once every course lesson is completed/submitted/approved, an explicit **Issue certificate** button becomes available.
- A certificate permanently snapshots the student's display name, course title and date of issue.
- Only one certificate per user/course may exist. Reissuance or correction after revocation requires separate manual review. Do not delete issued records.
- Staff can revoke a certificate with a reason. Revoked certificates no longer download and public verification returns valid=false. A certificate must not be revoked merely because a student's display name changes.

## PDF document and privacy

PDFKit generates a landscape A4 PDF using MIT-licensed PDFKit and licensed Noto Sans fonts delivered via npm dependencies. Its content includes the student's saved display name (not an identity verification), course title, certificate UUID, issue date and link to the public verification page. Names in Latin and Cyrillic are supported.

- GET /api/account/certificates — private student progress and issued certificates.
- GET /api/admin/certificates — admin-only overview and history.
- POST /api/admin/homework/:userId/:lessonId/approve — administrator approval.
- POST /api/admin/certificates/issue — administrator-only issuance.
- POST /api/admin/certificates/:serial/revoke — administrator-only revocation with reason.
- GET /api/certificates/:serial/pdf — private PDF for student owner or administrator, no-store.
- GET /api/certificates/verify/:serial — public validity, name and course displayed only to those who know the certificate UUID.

The certificate UUID is unguessable. Public verification of student name is intentional when sharing a certificate. Do not share private student emails, homework links, payment details or other account records.

## Tests and deployment

Run npm test, including test/certificates.test.js, and npm run test:e2e. The backend tests perform all approvals, prevent unapproved issuance, check PDF magic bytes and content-type, verify access isolation, and revoke an issued certificate. Real design and PDF readability should also be visually checked before public launch.

For production, persist the SQLite database and back it up: the certificate ledger is authoritative. Secure teacher access, audit approved work and avoid altering historical certificate records. SMTP notifications are queued when email is configured.
