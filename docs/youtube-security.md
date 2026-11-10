# YouTube-based course videos: honest security boundary

Legwork uses YouTube URLs for all course video playback. Administrators edit the video URL in Admin Studio → Edit Full Lesson Details. Video files do not have to be uploaded to the Legwork application.

## What the school protects

- The public API lesson catalog and lesson/bundle cards do not include YouTube watch/embed URLs or video IDs.
- The authenticated learning and watch endpoints check current paid entitlement (course, individual lesson or free lesson) on the server before returning the video URL. Merely adding to cart or opening a purchase request does not grant access.
- Authorized lesson responses have Cache-Control: private, no-store. Account-bound API requests are non-indexable and non-cacheable.
- New or edited lesson URLs must be HTTPS, from an exact recognized YouTube hostname, and contain a valid 11-character video ID. Fake domains and arbitrary third-party URLs are rejected.
- The iframe uses the standard youtube-nocookie.com player, HTTPS, explicit referrer policy, non-deprecated parameters and no overlapping custom controls.
- Sessions use hashed random tokens in HttpOnly, SameSite cookies (Secure in HTTPS production). Login attempts are rate-limited. At most four concurrent sessions are retained per account; the user can revoke all other sessions by confirming their current password.
- Purchased access continues to be granted only by verified backend workflows, never by browser redirect or client-side flag.
- Administrator endpoints require roles; password changes revoke all active sessions.

## What ordinary YouTube does not protect

YouTube Unlisted videos can be watched by anyone who gets the link. The link can be transferred. The browser playing the authorized iframe necessarily receives the YouTube video ID. An authorized viewer can find it in developer tools or network traffic and may record the screen using OS tools or another camera.

Do not advertise guaranteed recording prevention, link secrecy, DRM, download blocking, or domain locking for ordinary embedded YouTube. Blocking right-click, F12, devtools or copying is ineffective. Do not add overlays to obscure player controls.

YouTube Developer Policies also contain limitations on charging viewers specifically for access to videos in an embedded YouTube player. Review the commercial model against platform terms before launching paid YouTube-embedded lessons.

Official references:
- Privacy and Unlisted links: https://support.google.com/youtube/answer/157177
- YouTube iframe parameters: https://developers.google.com/youtube/player_parameters
- Player overlays: https://developers.google.com/youtube/terms/required-minimum-functionality
- Developer policies: https://developers.google.com/youtube/terms/developer-policies

## For stronger protection

If the requirement is that a video URL cannot be reused outside Legwork, YouTube is not the appropriate host. Select a video provider that explicitly supports per-domain restrictions plus short-lived authenticated playback tokens or signed manifests, with DRM for higher-value content. This still cannot prevent recording with an external camera. A provider integration requires the school's actual service account and a deployed origin.

## Launch checklist

1. Upload school-owned lesson clips to YouTube with the chosen privacy setting and Allow embedding enabled. Check authorized playback in a browser.
2. Never paste lesson URLs into public marketing pages, metadata, CMS copy, customer notifications or GitHub.
3. Set strong unique administrator credentials, private HTTPS deployment secrets and MFA on the owner's YouTube and email accounts.
4. Verify anonymous, unpaid, paid and administrator access, and test refund/revocation rules when finalized.
5. Use Profile → Account Security → Sign out other devices after suspicious access; change the password if compromised.
6. Approve YouTube commercial compliance, privacy and actual customer terms before accepting money.
