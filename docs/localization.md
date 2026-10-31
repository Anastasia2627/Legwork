# EN/ES localization

Legwork offers English and Spanish translations for major UI elements: navigation, catalog, filters, cart, classroom controls, account, login/recovery, payments, certificates, admin sections and common error feedback. The Home/Course/Mentorship hero text comes from the separate bilingual editorial editor.

English remains the canonical user interface source language. The translation dictionaries are public/i18n.js, public/es-public.js, public/es-admin.js and public/es-errors.js. Exact public interface text and a handful of numeric counters are translated without modifying the stored English product content or backend messages.

The language preference uses the local legwork_lang browser setting. Changing ES back to EN restores the persistent footer/navigation, instead of leaving old Spanish nodes on screen. Catalog option labels are translated but their internal values (used for filtering) remain unchanged. All prices, identifiers, server request fields and purchase state are left untouched.

User-generated content (student names, teacher comments, homework links) and custom product descriptions are not automatically translated. A human-approved Spanish version is still needed for lesson/course copy and long-form editorial/marketing sections. Exact-match UI mapping also means newly introduced labels should be reviewed against the glossary. Do not advertise complete bilingual course materials until a full editorial review is complete.

Testing: npm test validates message translations and npm run test:e2e verifies language toggling, filter values, footer/cart and localized authentication feedback on desktop/mobile Chromium.
