# Product analytics and feedback

Study Signal stores a small first-party event history in `analytics_events`. Event names are defined by the backend allowlist. Events may include the authenticated user ID, an owned course ID, a numeric entity reference, bounded enum/count metadata, and a timestamp.

The system does not accept arbitrary analytics metadata. It does not store document text, filenames, task descriptions, quiz questions or answers, Ask My Notes messages, email addresses, tokens, or LMS credentials. Quiz scores are reduced to broad score bands.

Product feedback is stored separately in `product_feedback`. It contains the authenticated user ID, the category and message intentionally submitted by the student, a page name, a route derived from that page name, a broad mobile/tablet/desktop viewport class, an optional deployment version, and a timestamp. No files or course content are attached automatically.

Analytics writes are best-effort. A failed event insert is reduced to a safe operational error containing only the allowlisted event name and cannot fail the underlying product action.

## Internal dashboard

There is no administrator role model yet, so the aggregate dashboard is development-only and disabled by default. Set:

```text
INTERNAL_ANALYTICS_ENABLED=true
```

in a non-production environment, then open `/internal-analytics.html` while authenticated. The page and its aggregate API remain unavailable in production even if the flag is set. It shows counts, funnel steps, feature adoption, and recent de-identified feedback; it does not expose student names or email addresses.

`APP_VERSION` may be set to a deployment version or commit. Railway deployments fall back to `RAILWAY_GIT_COMMIT_SHA` when available.

No external analytics network requests or third-party tracking scripts are used.
