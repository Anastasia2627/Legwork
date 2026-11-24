# Private student practice and course PDFs

LEGWORK keeps small PDF study notes and Guru homework **inside the same
SQLite database** as access control and progress. The existing encrypted
Cloudflare backup therefore includes the bytes as SQL rows; no unaudited
private KV bucket or public image library is used.

## Formats and limits

- Staff: up to 10 PDF course handouts per lesson, each max **1 MiB**.
- Guru students: one private PDF, PNG, JPEG or WebP attachment per lesson,
  max **1 MiB**. Larger videos stay an HTTPS homework link.
- Total for all private files: **40 MiB** in the current
  SQLite-backed Durable Object. These limits are intentionally conservative
  and may be revisited when a separate authorized file host is selected.
- Files are accepted only with the matching declared MIME and simple file
  signature checks. These checks **are not malware scanning**. Files are
  always returned with \`attachment\`, \`nosniff\`, restrictive CSP and
  \`Cache-Control: private, no-store\` and are never rendered inline.
- Original upload filenames are never stored or used for paths.
- Binary is Base64-encoded in \`private_learning_files\`; encrypted offline
  backup exports include the table. The export CLI requests one private
  row per page to avoid excessive JSON payloads.
- All API read/write operations enforce entitlements server-side.
  A student cannot download the PDF for a lesson not owned or
  download another student's homework. Only a Guru student can
  upload a private attachment; administrators may review it.
- Replacing/removing a homework attachment invalidates previous
  feedback and approval. Changing a student submission to an HTTPS
  link deletes the previous binary attachment. Current certificate
  eligibility still depends on valid Guru homework approval.

## API contracts

Authenticated authorized learner:
\`GET /api/learning/:lessonId/materials\`

Authorized learner/admin:
\`GET /api/learning/materials/:id/download\`

Admin:
\`POST /api/admin/lessons/:lessonId/materials?title=<encoded title>\`
with raw \`Content-Type: application/pdf\` request body;
\`DELETE /api/admin/materials/:id\`.

Guru learner:
\`POST /api/learning/:lessonId/homework-file\` with raw PDF/image body;
\`DELETE /api/learning/:lessonId/homework-file\`.

Owner or administrator:
\`GET /api/learning/homework-files/:userId/:lessonId/download\`.

## Operational security

There is no public GET for private attachments.
No thumbnails/previews of user uploads are generated.
Host and public image CDN can never fetch these routes as anonymous users.
The per-request parser enforces the size bound before SQL insert.

A school that needs large video uploads, antivirus scanning,
PDF rendering/sanitization or more storage must move to a dedicated
private object storage solution with explicit cost/retention controls.
Do **not** enable unbounded video uploads in the Cloudflare Durable Object.

Real content has not been uploaded; test files in CI are synthetic.
Course PDFs must be approved by the instructor before publication.
