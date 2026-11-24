# LEGWORK — Visual implementation against the supplied wireframes

The following files are the primary acceptance source:
- 1. Главная — обо мне.pdf
- 2. Курс Legwork Lab (шаблон).pdf
- 3. Shop.pdf
- 4. Mentorship — разбор видео.pdf
- 5. Личный кабинет.pdf
- ТЗ для дизайнера: сайт онлайн-школы Svetlana Yurchak.pdf
- Созвон Светлана × Анастасия — сайт онлайн-курсов, лояльность, бренд.pdf

The separate **Blitz Tattoo Studio Dresden** document belongs to another
project and is intentionally not applied to LEGWORK.

## Completed design implementation (24 November 2026)

Shared: white/black/bright-red palette, compact sticky header, condensed
high-weight display typography, course dropdown, EN/ES switch, cart, user
account and mobile navigation. The former sepia/serif override remains in
the source for reference, but the final \`reference-2026.css\` layer restores
the visual language shown in the wireframes.

1. **About:** full-width stage/approved-background-video hero, five-step story,
   four reason cards, large Legwork Lab flagship, smaller Wave/Split coming-soon
   cards, achievements/tabs, actual published galleries/reviews only,
   red free-introduction CTA. The home page does not duplicate a dedicated
   Shop or Mentorship promo block.
2. **Legwork Lab:** original course promise with scalable LIKE A BOSS logo,
   four-audience cards, outcomes, author, four learning steps, entire
   server-side class program displayed four across on desktop,
   grid/scrolling-carousel mode, gated free introduction, two
   server-priced tiers, realistic certificate pathway, related active bundles
   and FAQ.
3. **Classes:** existing searchable, filterable direction shelves,
   preparation/warm-up/elements, active bundles, mobile filter drawer,
   buyable cards, sticky sidebar, full lesson detail with accurate equipment
   and access controls, related practice and course upsell.
4. **Mentorship:** Basic and Deep cards, personal coaching evidence,
   four-stage request overview, package buttons, conditional Deep
   questionnaire, real signed-in name/email, saved mentorship request and
   account response. **Only HTTPS video links can currently be submitted**.
5. **Personal cabinet:** real progress, resume learning, purchased courses and
   classes, reviews, achievements, password/profile controls and separate
   admin review queue. Existing order/payment/account security systems remain
   protected by the unchanged backend.

## Content and feature prerequisites (not falsely advertised)

- **Video/photo assets:** available only when owner-approved and published in
  the CMS. Empty assets use deliberate neutral placeholders, not fake imagery.
  There are no invented testimonials or imaginary class previews.
- **Public promotions:** buy-three-get-one-free and completion bonuses are
  draft ideas in the brief, **not** active offers.
- **Mentorship pricing and file upload:** package amounts/response-time
  promises are not yet approved; directly uploading large video files requires
  a separate secure video-storage design. Currently only HTTPS links work.
- **Course certificates:** existing teacher and access checks remain required.
  No certificate is granted simply by clicking the course landing page.
- **YouTube protection:** only the current server-side entitlement gating is
  enforceable. Browser users who can watch videos may inspect network
  requests or record the screen; the requested total copy/screen-capture
  prevention cannot be promised with unlisted YouTube embeds.
- **Checkout:** keep provider disabled until actual merchant configuration,
  reconciliation and callback verification are approved.

## Release verification

Browser regression tests validate reference composition, responsive widths,
course grid/carousel, dropdown, Mentor Basic/Deep state and class privacy.
They complement existing security tests, Node API tests, Docker smoke tests and
Cloudflare smoke tests. CI passing does not by itself confirm an actual
Cloudflare redeploy or owner approval of the final creative.
