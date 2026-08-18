# Study.ai

Study.ai is an Express, SQLite, and vanilla JavaScript study platform. Express
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

See [backend/DEVELOPMENT_DATA.md](backend/DEVELOPMENT_DATA.md) to claim the
preserved ECON 110 development account.

## Production

Production is a single Express service and domain. Copy `.env.example` into the
platform's secret/configuration system and set values there; do not commit an
`.env` file. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the required
variables, persistent-volume constraints, object storage, Ollama limitation,
container build, migration, health checks, and rollback procedure.
