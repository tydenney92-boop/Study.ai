# Study Signal

Study Signal is an Express, SQLite, and vanilla JavaScript study platform. Express
can serve both the API and frontend from one origin in production while the
existing split frontend/backend workflow remains available locally.

## Local development

Install and start the API:

```sh
cd backend
npm install
npm run dev
```

Serve the project root on `http://localhost:8080` with your preferred static
server. The frontend detects that development port and calls the API at
`http://localhost:3000`. Alternatively, set `SERVE_FRONTEND=true` and open
`http://localhost:3000`; API requests then use the same origin.

Run tests with `cd backend && npm test`. Local defaults use `backend/study-ai.db`,
`backend/uploads`, Ollama at `http://localhost:11434`, and non-secure localhost
session cookies.

Local AI defaults to Ollama. Set `AI_PROVIDER=ollama`, `AI_ENABLED=true`,
`OLLAMA_BASE_URL=http://localhost:11434`, and `OLLAMA_MODEL` to the installed
local model. OpenAI is also available through the same server-side provider
boundary; never put `OPENAI_API_KEY` in frontend files.

See [backend/DEVELOPMENT_DATA.md](backend/DEVELOPMENT_DATA.md) to claim the
preserved ECON 110 development account.

## Browser-level regression tests

Install the Chromium test browser once, then run the isolated Playwright suite:

```sh
cd backend
npm install
npx playwright install chromium
npm run test:e2e
```

Use `npm run test:e2e:headed` to observe the browser. The suite starts its own
server on `127.0.0.1:4173`, creates a temporary SQLite database and upload
directory, runs migrations from scratch, and removes the temporary files when
the suite exits. A deterministic injected AI client is used; the suite never
contacts Ollama or OpenAI and never opens the local development database.

Failure screenshots, videos, and retry traces are written beneath
`backend/test-results/e2e-artifacts/` and are ignored by Git.

## Production

Production is a single Express service and domain. Copy `.env.example` into the
platform's secret/configuration system and set values there; do not commit an
`.env` file. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the required
variables, persistent-volume constraints, object storage, Ollama limitation,
container build, migration, health checks, and rollback procedure.
