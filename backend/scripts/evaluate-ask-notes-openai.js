const path = require("path");
const { runAskNotesEvaluation } = require("../evaluation/ask-notes-evaluator");
const { writeEvaluationReport, publicSummary } = require("../evaluation/report-writer");

function requireEvaluationConfiguration(environment = process.env) {
    if (environment.RUN_OPENAI_RAG_EVAL !== "1") {
        throw new Error("Set RUN_OPENAI_RAG_EVAL=1 to authorize the paid Ask My Notes evaluation.");
    }
    for (const name of ["OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"]) {
        if (!environment[name]) throw new Error(`${name} is required for the OpenAI RAG evaluation.`);
    }
    if (!environment.OPENAI_MODEL_STANDARD && !environment.OPENAI_MODEL) {
        throw new Error("OPENAI_MODEL_STANDARD or OPENAI_MODEL is required for the OpenAI RAG evaluation.");
    }
}

async function main() {
    requireEvaluationConfiguration();
    const { createOpenAiEmbeddingClient } = require("../src/services/openai-embedding-client");
    const { createOpenAiClient } = require("../src/services/openai-client");
    const rawEmbeddingClient = createOpenAiEmbeddingClient({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_EMBEDDING_MODEL,
        dimensions: process.env.OPENAI_EMBEDDING_DIMENSIONS
            ? Number(process.env.OPENAI_EMBEDDING_DIMENSIONS) : null,
        timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS) || 30000
    });
    const embeddingUsage = { requests: 0, items: 0, totalTokens: 0 };
    const embeddingClient = {
        ...rawEmbeddingClient,
        usage: embeddingUsage,
        async embed(inputs) {
            const result = await rawEmbeddingClient.embed(inputs);
            embeddingUsage.requests++;
            embeddingUsage.items += inputs.length;
            embeddingUsage.totalTokens += result.usage?.totalTokens || 0;
            return result;
        }
    };
    let latestUsage = null;
    const model = process.env.OPENAI_MODEL_STANDARD || process.env.OPENAI_MODEL;
    const aiClient = createOpenAiClient({
        apiKey: process.env.OPENAI_API_KEY,
        models: { fast: model, standard: model, advanced: model },
        timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 120000,
        onUsage(usage) { latestUsage = usage; }
    });
    const answerGenerator = async ({ prompt }) => {
        latestUsage = null;
        const text = await aiClient.generate(prompt, { tier: "standard" });
        return { text, usage: latestUsage };
    };
    const manifestPath = process.env.RAG_EVAL_MANIFEST || process.argv[2] ||
        path.resolve(__dirname, "../evaluation/ask-notes-sample/manifest.json");
    const report = await runAskNotesEvaluation({
        manifestPath,
        embeddingClient,
        answerGenerator,
        topK: Number(process.env.AI_ASK_NOTES_RETRIEVAL_TOP_K) || 6,
        minimumSimilarity: Number(process.env.RETRIEVAL_MINIMUM_SIMILARITY) || 0.15,
        hybridSemanticWeight: Number(process.env.RETRIEVAL_HYBRID_SEMANTIC_WEIGHT) || 0.65,
        answerMode: process.env.RAG_EVAL_ANSWER_MODE || "semantic",
        embeddingCachePath: process.env.RAG_EVAL_EMBEDDING_CACHE ||
            path.resolve(__dirname, "../evaluation-output/ask-notes-embedding-cache.json"),
        embeddingBatchSize: Number(process.env.EMBEDDING_INDEX_BATCH_SIZE) || 32
    });
    report.provider = {
        embeddings: { provider: "openai", model: process.env.OPENAI_EMBEDDING_MODEL },
        generation: { provider: "openai", model }
    };
    const outputPath = writeEvaluationReport(report, process.env.RAG_EVAL_OUTPUT);
    console.log(JSON.stringify({ reportPath: outputPath, ...publicSummary(report) }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { main, requireEvaluationConfiguration };
