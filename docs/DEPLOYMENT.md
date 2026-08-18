# Production deployment

## Runtime architecture

Build the root `Dockerfile` and run one Express instance behind an HTTPS reverse
proxy. Express serves the API and the allowlisted frontend assets. Configure the
platform health checks as:

- liveness: `GET /health/live`
- readiness: `GET /health/ready`

The readiness response reveals only driver/configuration status. It does not
expose paths, credentials, database errors, or AI URLs.

## Required production configuration

Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, a random
`SESSION_SECRET` of at least 32 characters, `DATABASE_DRIVER=sqlite`, an absolute
`DATABASE_PATH`, `DATABASE_BACKUP_DIRECTORY`, `STORAGE_DRIVER`, `AI_PROVIDER=ollama`,
and `SERVE_FRONTEND=true`. Keep `TRUST_PROXY_HOPS=1` and `SECURE_COOKIES=true`
when the platform terminates HTTPS one hop in front of Express.

For local persistent uploads, set `STORAGE_DRIVER=local` and an absolute
`UPLOAD_DIRECTORY` on a mounted volume. For durable object storage, set
`STORAGE_DRIVER=s3`, `OBJECT_STORAGE_BUCKET`, and `OBJECT_STORAGE_REGION`.
`OBJECT_STORAGE_ENDPOINT` and path-style mode support S3-compatible services.
Credentials may be provided through the listed environment variables or the
runtime's workload identity/default AWS credential chain.

For AI, set `AI_ENABLED=true`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL`. The URL must
point to an Ollama service reachable from the deployed container. Set
`AI_ENABLED=false` if the rest of Study.ai should run before an Ollama service is
available; generation endpoints then return a stable 503. No paid provider is
configured.

## SQLite constraints and data safety

The first deployment supports exactly one application replica with SQLite on a
persistent volume. Never place the database on an ephemeral container filesystem.
SQLite runs in WAL mode with foreign keys and a five-second busy timeout. The
migration runner creates a verified pre-migration backup when the database exists.

Before first production startup, copy the complete development database and
uploaded files only if you intentionally want that data online. Keep the source
backup untouched. Run migrations with the same mounted paths using:

```sh
cd backend
npm run migrate
```

PostgreSQL is the recommended next database milestone before horizontal scaling.
That migration must add an asynchronous PostgreSQL adapter, translate SQLite
triggers/checks/placeholders, replace `lastInsertRowid`, move sessions to a shared
store, provide a verified data-copy command, and run ownership parity tests. The
repository/service boundary is retained so route and business logic need not
change.

## Container deployment sequence

1. Provision one web service, HTTPS domain, persistent database/backup volume,
   and an S3-compatible bucket or persistent upload volume.
2. Configure environment variables in the platform secret manager.
3. Build the root `Dockerfile`.
4. Run `npm run migrate` as a release/pre-start task with the production mounts.
5. Start with `npm run start:production` from `/app/backend`.
6. Require `/health/ready` to return 200 before routing traffic.
7. Register a new account or explicitly claim the preserved development account.
8. Verify upload, study-guide, quiz, attempt, logout, and a second user's isolation.

Rollback the application image without rolling the database backward. Restore a
verified pre-migration database backup only during a controlled outage and only
with a matching copy of uploaded objects/files.
