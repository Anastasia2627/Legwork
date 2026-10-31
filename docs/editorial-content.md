# Legwork bilingual editorial content editor

The main hero content for the **Home**, **Legwork Lab course**, and **Mentorship** pages can be managed without editing source code.

## How to edit

1. Log in with an administrator account.
2. Open My Account → Admin → **Website Text & Language Editor**.
3. Expand one page and language, for example HOME · ES.
4. Change the text-only fields and save.
5. Preview the public route in the chosen language.

Editable fields: the small section label, main heading (home has two visual lines), introduction, main button label, browser page title and meta description. Changes are saved in SQLite and persist across server restarts.

**English and Spanish are independent.** The editor loads existing copy for both locales and starts with the shipped defaults. Content is not fetched from external AI services.

## Safety

- Only authenticated administrators may call the editor's read/write API.
- The public endpoint serves only approved plain text; it contains no user credentials or private customer records.
- The server accepts a fixed set of field names and language codes, enforces maximum lengths and rejects markup characters.
- Client rendering escapes editorial values before inserting them into the page.
- A revision number prevents one administrator from silently overwriting a newer save by another.
- No external scripts, files, HTML, CSS, video URLs or payment settings can be edited through this module.

## What this does not do

This is **not** a full-page visual builder. The page layouts are fully custom code, as requested. Course catalog and course prices have their own admin controls.

This is not a complete EN/ES translation of the product: other sections, lesson descriptions, administrative labels and the student player still need a reviewed language pass. Browser titles and meta descriptions update in the client, but **hash-based client-side navigation is not sufficient for strong search-engine indexing**. Before launch, evaluate server rendering or a prerender strategy plus separate crawlable URLs, canonical tags and rich metadata.

Do not use unverified claims or placeholder teacher achievements in published marketing copy. Provide approved public copy, photographs and policy documents before releasing the commercial site.

## API

- GET /api/content: public effective copy for both locales.
- GET /api/admin/content: admin-only effective copy and current revision numbers.
- PUT /api/admin/content/:page/:lang: admin-only complete set of allowed text fields and expected revision.

Tests cover student/anonymous write denials, rejected markup, unknown fields, revision conflicts, EN/ES independence, persistence after restart, and browser display of edited copy.
