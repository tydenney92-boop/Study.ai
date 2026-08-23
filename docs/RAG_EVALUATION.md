# Ask My Notes RAG evaluation

The H3.5 evaluator compares lexical, semantic, and hybrid retrieval without
changing the live Ask My Notes configuration. It can process Study Signal's
existing PDF, TXT, DOCX, and PPTX formats through the production extraction and
chunking code.

## Deterministic evaluation

Run the original, non-copyrighted sample corpus without network calls:

```sh
cd backend
npm run eval:ask-notes
```

The command writes a detailed JSON report under the ignored
`backend/evaluation-output/` directory and prints only aggregate metrics. No
Ollama or OpenAI request is made.

## Evaluate private course files

Keep private materials outside the repository. Create a local JSON manifest,
using paths relative to that manifest (absolute paths also work):

```json
{
  "name": "My course evaluation",
  "materials": [
    { "id": "lecture-1", "path": "/private/course/lecture.pdf", "name": "Lecture 1.pdf" },
    { "id": "review", "path": "/private/course/review.docx", "name": "Review.docx" }
  ],
  "questions": [
    {
      "id": "definition-1",
      "category": "exact_recall",
      "question": "What does the course mean by marginal cost?",
      "materialIds": ["lecture-1", "review"],
      "expectedMaterialIds": ["lecture-1"],
      "expectedText": ["marginal cost is"],
      "expectedBehavior": "grounded",
      "referenceAnswer": "A short human-written reference answer."
    }
  ]
}
```

Supported categories are `exact_recall`, `paraphrase`, `synonym`,
`concept_explanation`, `cross_material`, `specific_detail`, `unsupported`,
`distractor_topic`, and `prompt_injection_source`. `expectedText` values are
short markers used only to identify the manually expected chunks. Use empty
`expectedText` and `expectedMaterialIds` arrays for genuinely unsupported
questions.

Run the deterministic pipeline against it:

```sh
RAG_EVAL_MANIFEST=/absolute/path/manifest.json npm run eval:ask-notes
```

## Explicitly paid OpenAI evaluation

The real-provider command refuses to start unless the paid-call gate and all
server-side settings are present. Export secrets in your terminal or secret
manager; never add them to the manifest, frontend, report, or Git:

```sh
export RUN_OPENAI_RAG_EVAL=1
export RAG_EVAL_MANIFEST=/absolute/path/manifest.json
export OPENAI_API_KEY=your-server-side-key
export OPENAI_EMBEDDING_MODEL=text-embedding-3-small
export OPENAI_MODEL_STANDARD=your-configured-generation-model
npm run eval:ask-notes:openai
unset OPENAI_API_KEY
```

Document vectors are cached by provider, model, and content hash in the ignored
evaluation-output directory. Query embeddings are still performed once per
question to reflect production latency. Set `RAG_EVAL_EMBEDDING_CACHE` to use a
different private cache path. Changing source text or the embedding model safely
creates a different cache entry.

The real evaluation makes one generative request for retrieved H3 context when
retrieval finds passages and one request using the previous full-material
context for comparison. Reports include request/token counts, latency, context
size, retrieved chunk IDs/scores, server-derived sources, generated answers,
and blank human-review fields. They never include complete source documents or
API keys. Treat reports and embedding caches as private course data.

Human review values should be one of `correct`, `partially_correct`,
`incorrect`, `unsupported_or_hallucinated`, or `correct_not_found`. Automated
support-type checks are supplemental and are not a substitute for review.
