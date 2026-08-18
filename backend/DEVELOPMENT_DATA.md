# Seeded development data

The Stage 2 legacy migration retains the original ECON 110 records under user ID 1,
`development@study.ai`. Stage 6 intentionally leaves that user's `password_hash`
empty so the legacy account does not ship with a known password.

To claim the account locally, stop the backend and run:

```sh
DEVELOPMENT_USER_PASSWORD='choose-a-strong-local-password' npm run claim:development-user
```

The command runs all pending migrations, uses bcrypt, updates only the seeded
account when its password is still missing, and refuses to overwrite an existing
password. Existing course, unit, material, generated-content, attempt, flashcard,
and uploaded-file records are not changed.

For production, set `SESSION_SECRET` to a long random value, set `NODE_ENV=production`
so cookies require HTTPS, and configure `FRONTEND_ORIGIN` to the deployed frontend.
