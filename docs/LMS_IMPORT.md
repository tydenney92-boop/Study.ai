# LMS import

Study Signal imports LMS deadlines through server-side provider adapters. Canvas is the first adapter; `learning_suite` is reserved until BYU publishes a supported integration contract. The sync is manual because the current deployment has no durable, single-consumer job queue.

## Canvas configuration

Register a Canvas Developer Key with the institution and configure:

- `CANVAS_BASE_URL` — institution Canvas origin, HTTPS only
- `CANVAS_CLIENT_ID` and `CANVAS_CLIENT_SECRET` — Developer Key credentials
- `CANVAS_REDIRECT_URI` — exactly the registered `/api/lms/canvas/callback` URL
- `LMS_ENCRYPTION_KEY` — independent random secret of at least 32 characters

OAuth uses Canvas's authorization-code flow. Tokens are exchanged and encrypted on the server with AES-256-GCM; they are not returned by Study Signal APIs or logged. A 401 requires reconnection in this milestone. Production users must never be asked for manually generated tokens or Canvas passwords.

The Canvas adapter reads active courses and course assignments using the official REST API. It requests string IDs, imports only valid due dates, treats Canvas quizzes as `quiz` rather than guessing exams from titles, strips HTML descriptions, and records remote submission state separately from local Study Signal completion.

## Reconciliation policy

Course mappings are always explicit. Each imported task is unique by Study Signal course, provider, and external assignment ID. Repeated sync updates provider-owned fields without changing local completion. Manual tasks are never selected for an LMS upsert. Items missing remotely are marked `removed_at` and hidden, not permanently deleted.

## Learning Suite and ICS

No current official public BYU Learning Suite API or OAuth/application documentation was found. Historical BYU material indicates that some courses exposed iCalendar feeds, but a current stable feed/export contract, authentication rules, and timezone behavior could not be verified. Consequently this milestone does not scrape Learning Suite, retain BYU sessions, automate Duo, or implement an unverified ICS URL importer. The adapter boundary can accept a supported Learning Suite or provider-neutral ICS adapter later.

References: [Canvas API](https://www.canvas.instructure.com/doc/api/), [Canvas OAuth2](https://www.canvas.instructure.com/doc/api/file.oauth.html).
