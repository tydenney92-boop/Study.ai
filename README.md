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
boundary; never put `OPENAI_API_KEY` in frontend files. For tiered OpenAI
routing, configure `OPENAI_MODEL_FAST`, `OPENAI_MODEL_STANDARD`, and
`OPENAI_MODEL_ADVANCED`. The legacy `OPENAI_MODEL` remains a fallback for any
unset tier.

### Optional retrieval embeddings

H1 lexical retrieval remains the default. H2 can persist OpenAI embeddings for
material chunks and select `semantic` or `hybrid` ranking without changing the
stable retrieval-service interface. Embeddings are never enabled automatically.

Set `EMBEDDINGS_ENABLED=true`, `EMBEDDINGS_PROVIDER=openai`,
`OPENAI_API_KEY`, and `OPENAI_EMBEDDING_MODEL` on the server. Then choose
`RETRIEVAL_MODE=semantic` or `RETRIEVAL_MODE=hybrid`. Optional controls include
`OPENAI_EMBEDDING_DIMENSIONS`, `EMBEDDING_VERSION`,
`EMBEDDING_INDEX_BATCH_SIZE`, `EMBEDDING_INDEX_MAX_CHUNKS`,
`RETRIEVAL_HYBRID_SEMANTIC_WEIGHT`, and `RETRIEVAL_MINIMUM_SIMILARITY`.
Changing the model, version, or chunk content marks the stored vector stale.

New uploads receive bounded best-effort embedding indexing when enabled; an
embedding-provider outage never removes the uploaded material or its lexical
chunks. Existing chunks are indexed only through the explicit bounded command:

```sh
cd backend
npm run index:embeddings
```

Compare lexical, semantic, and hybrid ranking without paid calls using
`npm run eval:retrieval`. A deliberately paid smoke evaluation is available as
`npm run eval:retrieval:openai`, but it refuses to run unless
`RUN_OPENAI_EMBEDDING_EVAL=1`, `OPENAI_API_KEY`, and
`OPENAI_EMBEDDING_MODEL` are set. Normal unit and browser tests always use fake
clients and never contact OpenAI or Ollama.

For a real-course Ask My Notes comparison harness, including private manifest
format and the explicitly gated paid command, see
[docs/RAG_EVALUATION.md](docs/RAG_EVALUATION.md).

Ask My Notes uses this retrieval interface to supply a bounded set of relevant
chunks instead of concatenating complete selected documents. Configure the
conservative result limit with `AI_ASK_NOTES_RETRIEVAL_TOP_K` (default 6,
maximum 20). When semantic retrieval is configured, embedding failures fall
back to lexical retrieval. No-match retrieval returns the grounded not-found
response without calling the generative AI provider. Study Guides, Quizzes, and
Flashcards continue using their existing full selected-material context.

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
