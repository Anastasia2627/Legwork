# Legwork frontend — design and maintenance

This project is a **single Express / SQLite application**, not a collection of static GitHub Pages mocks. The storefront has five priority views: About, Legwork Lab, Classes, Mentorship and Account.

## Stylesheet organization

The page currently loads these files in order:

- `public/styles.css`: original functional and layout styles. Existing form, drawer, study and admin behaviors rely on some of these selectors. Treat as **legacy** and migrate remaining rules carefully rather than deleting without testing.
- `public/learning.css`, `public/accessibility.css`: learning view and accessibility.
- `public/css/core.css`: design tokens, typography, header, buttons, spacing, shared containers.
- `public/css/components.css`: reusable lesson cards, bundle covers, media frames and pricing.
- `public/css/pages/home.css`: About, story, course spotlight, awards and home hero.
- `public/css/pages/course.css`: Legwork Lab hero, course structure, outcomes and free lesson.
- `public/css/pages/shop.css`: library layout, filters, search, shelves and product grids.
- `public/css/pages/mentorship.css`: mentoring introduction, packages, feedback and request form.
- `public/css/pages/account.css`: student/admin dashboard layouts and progress visuals.

When changing an element, edit its owning stylesheet. Do not append another general 'design override' file. Avoid !important except for documented legacy compatibility.

**Type scale:** two families only — Archivo Black for logo, major hero/display and course lockups, DM Sans for body, section headings, card headings, menus and forms. Body 15 px with 1.6 line height. A section heading should not compete with the main hero headline.

## Real photo handling

`public/media.js` is a centralized registry for approved photos and credits. The current portrait and archival performance image are external, credited **development preview** references from PoleCon and TSN. Images being publicly visible does not confer commercial reuse rights. Before public deployment, obtain approved original high-resolution photos and rights/permission; replace the two registry URLs with licensed files served from the same host or a media CDN. Avoid hotlinking third-party editorial sites in production.

The public `lessons.cover_url` field stores an HTTPS image URL for each lesson. The admin editor supports editing the field, and the storefront prefers it over a branded typographic fallback. `cover_url` must be a public image, **never** an unlisted course video link. Do not mix lesson access and thumbnails.

To update lesson images: sign in as admin → Admin Studio → Edit Full Lesson Details → Public cover image URL → Save Lesson. A missing URL uses the simple branded cover, not a fake photo.

To add first-party video/GIF previews later, create a dedicated public preview field and use small poster/MP4 files; do not expose private lesson video URLs through public API responses.

## Functionality and deployment notes

Express runs public pages and API together on localhost:3000. `server.js` uses an idempotent SQLite migration for `lessons.cover_url`; existing local data remains intact. Payment processing, email and video distribution have independent setup and should be verified before public release. Admin forms and student access should be regression tested after any page work.

## Verification

Run `npm test` and `npm run test:e2e` (after installing the Playwright browser with `npx playwright install chromium`) from your project directory. Inspect home, course, shop, mentorship and account at desktop and mobile widths. Confirm the Network tab loads every CSS file with HTTP 200. Check the browser console for JavaScript and CSP errors. External photos may be blocked by their hosting sites; test with properly licensed local assets before release.

## Admin-editable media URLs

The public media registry is backed by the `site_media` SQLite table and `GET /api/media`. An authenticated school administrator edits the allowed photo/video URL slots in **Admin Studio → Public Media Library**. The site loads them for the home hero (public video/poster), timeline, workshops, approved reviews, course hero/preview, mentorship photo/example, shop bundle cover, and student course thumbnail. Lesson covers remain in `lessons.cover_url` and can be set separately.

This feature stores **public HTTPS URLs, alternative text and optional attribution**, not binary files. It does not establish licensing rights or validate remote-file content. Only use material you control or are permitted to publish. The school must never put private homework videos, private student footage or paid lesson recordings in these public slots. If a URL is empty, the original placeholder is retained.


## Native image upload workflow

Administrators can upload JPEG/PNG/WebP files in Public Media Library and the Full Lesson Details editor. The browser sends binary bytes to the authenticated image-upload API; the server converts the image to metadata-free WebP, stores it on persistent disk and returns a relative media URL. Saving the media slot or lesson attaches that URL. Video sources still require an external HTTPS link, and student or paid class recordings must not be published in this media library.
