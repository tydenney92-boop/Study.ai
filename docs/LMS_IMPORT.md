# LMS import

Study Signal imports LMS deadlines through server-side provider adapters. Canvas is the first production adapter; `learning_suite` remains reserved until BYU publishes a supported integration contract. Sync remains manual because the current deployment has no durable, single-consumer job queue.

## What the Canvas integration does

- Uses Canvas OAuth 2 authorization-code authentication. Students never give Study Signal a Canvas password or manually generated token.
- Lists currently active courses where the authenticated user has a student enrollment.
- Requires the student to explicitly map each Canvas course to an existing Study Signal course, create a course, or choose **Don't import**.
- Imports dated Canvas assignments through the official Assignments API with the current user's submission included.
- Treats assignments with `quiz_id` or `online_quiz` submission type as quizzes. It does not guess exams from titles.
- Keeps Canvas submission state (`submitted`, `graded`, `pending review`, `late`, `missing`, or `unsubmitted`) separate from Study Signal's local completion flag.
- Updates provider-owned fields on repeat sync without overwriting local completion. Manual Study Signal tasks are never selected by an LMS upsert.
- Marks assignments absent from a later complete Canvas response as remotely removed. It does not hard-delete them.

## Real Canvas setup

### 1. Obtain a Canvas Developer Key

Ask the Canvas institution administrator to create an API Developer Key for Study Signal. Canvas Cloud developer keys are institution-issued. Configure the key for the institution that owns `CANVAS_BASE_URL` and turn it on.

If the institution restricts API scopes, allow these read scopes:

```text
url:GET|/api/v1/courses
url:GET|/api/v1/courses/:course_id/assignments
```

Study Signal does not request write, grade, submission, roster, or file permissions.

### 2. Register the redirect URI

Set the Developer Key redirect URI to the exact deployed callback, with no query string or fragment:

```text
https://YOUR-STUDY-SIGNAL-DOMAIN/api/lms/canvas/callback
```

The same exact value must be used for `CANVAS_REDIRECT_URI`. It must use the same origin as `APP_ORIGIN`.

### 3. Set Railway variables

Configure these as Railway service variables:

```text
CANVAS_BASE_URL=https://YOUR-INSTITUTION.instructure.com
CANVAS_CLIENT_ID=INSTITUTION_ISSUED_CLIENT_ID
CANVAS_CLIENT_SECRET=INSTITUTION_ISSUED_CLIENT_SECRET
CANVAS_REDIRECT_URI=https://YOUR-STUDY-SIGNAL-DOMAIN/api/lms/canvas/callback
LMS_ENCRYPTION_KEY=AN_INDEPENDENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

`CANVAS_BASE_URL` must be only the HTTPS institution origin. Do not add `/api`, a path, query, or fragment. Keep the client secret and encryption key in Railway variables, never in Git or frontend configuration. Use an encryption key independent from `SESSION_SECRET`; rotating it without a credential migration invalidates stored LMS tokens.

When every Canvas variable is absent, Study Signal starts normally and shows Canvas as unavailable. A partially configured production deployment fails validation rather than pretending Canvas is usable.

### 4. Deploy

Deploy after the Developer Key is enabled and the variables are present. Canvas access tokens normally expire after one hour. Study Signal stores access and refresh tokens encrypted with AES-256-GCM, refreshes shortly before expiration or once after a 401, stores the replacement access token, and retries the original Canvas request only once.

### 5. Connect a test account

Sign in to Study Signal, open **Planner → Import from LMS**, and choose **Connect Canvas**. Approve access on the institution Canvas page. On return, explicitly map at least one Canvas course and select **Sync Now**. Verify the imported item in Upcoming and Calendar, its Canvas status, and its **Open in Canvas** link.

Disconnect attempts Canvas's supported token revocation before clearing the encrypted local credentials. Imported Planner tasks remain; the UI explains this before confirmation.

## Safe real-Canvas smoke mode

Default automated tests never contact Canvas. A deployed or local operator can perform a read-only smoke check against an already authorized test connection:

```text
RUN_CANVAS_SMOKE=1
CANVAS_SMOKE_USER_ID=<test Study Signal user id>
CANVAS_SMOKE_CONNECTION_ID=<test LMS connection id>
npm run smoke:canvas
```

Run the command from `backend/`. It lists active courses and fetches assignments for the first mapped course without syncing or changing Planner tasks. Output contains only connection/course/assignment IDs and counts. It never prints tokens, assignment titles or descriptions, student names, or grades. `RUN_CANVAS_SMOKE` is unset by default.

## Reconciliation and errors

- Course and assignment pagination follows Canvas `Link` headers as opaque same-origin URLs, with a hard page bound.
- Requests are sequential. A 429 is reported for a later manual retry rather than creating a retry storm.
- 403 and 404 failures are isolated to the affected mapped course when possible.
- A refresh failure marks the connection **Needs reconnection** and stops further requests.
- Other partial failures preserve successful course imports and mark the connection **Sync failed**.
- Deselecting a prior mapping marks its imported tasks unavailable and removes the mapping; it does not delete those tasks.

## Security boundary

OAuth state is random, single-use, session/user scoped, constant-time compared, and expires after ten minutes. The configured redirect URI is fixed. Access tokens, refresh tokens, the client secret, and the encryption key never enter frontend JavaScript or URLs and are never logged. Canvas API calls occur only on the backend, and every connection and mapping query is scoped to the authenticated Study Signal user.

Official references:

- [Canvas OAuth2](https://canvas.instructure.com/doc/api/file.oauth.html)
- [Canvas Courses API](https://canvas.instructure.com/doc/api/courses.html)
- [Canvas Assignments API](https://canvas.instructure.com/doc/api/assignments.html)
- [Canvas Submissions API](https://canvas.instructure.com/doc/api/submissions.html)
- [Canvas pagination](https://canvas.instructure.com/doc/api/file.pagination.html)
- [Canvas throttling](https://canvas.instructure.com/doc/api/file.throttling.html)

## Learning Suite

No current official public BYU Learning Suite API or OAuth/application contract has been verified. Study Signal does not scrape Learning Suite, retain BYU sessions, automate Duo, or call reverse-engineered endpoints. The provider boundary can accept a supported Learning Suite or provider-neutral calendar adapter later.
