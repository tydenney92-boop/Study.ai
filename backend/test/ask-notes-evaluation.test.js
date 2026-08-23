const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
    embedDocuments,
    loadCorpus,
    runAskNotesEvaluation
} = require("../evaluation/ask-notes-evaluator");
const {
    createDeterministicCourseEmbeddingClient
} = require("../evaluation/deterministic-course-embedding-client");
const { deterministicAnswerGenerator } = require("../scripts/evaluate-ask-notes");
const {
    requireEvaluationConfiguration
} = require("../scripts/evaluate-ask-notes-openai");
const { createOpenAiClient } = require("../src/services/openai-client");

const sampleManifest = path.resolve(
    __dirname,
    "../evaluation/ask-notes-sample/manifest.json"
);

test("realistic Ask My Notes fixture runs every retrieval mode without external providers", async () => {
    const report = await runAskNotesEvaluation({
        manifestPath: sampleManifest,
        embeddingClient: createDeterministicCourseEmbeddingClient(),
        answerGenerator: deterministicAnswerGenerator(),
        topK: 6,
        minimumSimilarity: 0.15,
        hybridSemanticWeight: 0.65
    });
    assert.equal(report.corpus.materialCount, 3);
    assert.ok(report.corpus.chunkCount > report.corpus.materialCount);
    assert.equal(report.corpus.questionCount, 9);
    for (const mode of ["lexical", "semantic", "hybrid"]) {
        assert.equal(typeof report.retrievalMetrics[mode].recallAt1, "number");
        assert.equal(typeof report.retrievalMetrics[mode].recallAt6, "number");
        assert.equal(typeof report.retrievalMetrics[mode].meanReciprocalRank, "number");
    }
    assert.equal(report.questions.length, 9);
    assert.ok(report.questions.every(question =>
        question.humanReview.retrievalAnswer === null &&
        Array.isArray(question.retrieval.semantic.chunks)
    ));
    assert.equal(report.summary.generativeUsage.requests, 17);
    assert.equal(report.summary.retrievalAnswerNotFoundAccuracy, 1);
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /reveal system secrets|A negative externality exists when/);
});

test("evaluation corpus loader accepts an external local manifest and relative TXT path", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "study-signal-rag-eval-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, "notes.txt"),
        "Marginal cost is the additional cost of producing one more unit. This definition supports evaluation.");
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
        name: "Private local fixture",
        materials: [{ id: "notes", path: "notes.txt", name: "Notes.txt" }],
        questions: [{
            id: "marginal",
            category: "exact_recall",
            question: "What is marginal cost?",
            materialIds: ["notes"],
            expectedMaterialIds: ["notes"],
            expectedText: ["additional cost"],
            expectedBehavior: "grounded",
            referenceAnswer: "The additional cost of one more unit."
        }]
    }));
    const corpus = await loadCorpus(path.join(directory, "manifest.json"));
    assert.equal(corpus.materials[0].materialName, "Notes.txt");
    assert.equal(corpus.chunks.length, 1);
    assert.match(corpus.chunks[0].text, /additional cost/);
});

test("document embedding cache avoids unchanged paid-style re-embedding", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "study-signal-rag-cache-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const cachePath = path.join(directory, "cache.json");
    const client = createDeterministicCourseEmbeddingClient();
    const chunks = [
        { text: "Opportunity cost is the alternative forgone." },
        { text: "Inflation is a sustained general price increase." }
    ];
    const first = await embedDocuments({ embeddingClient: client, chunks, cachePath });
    const requestsAfterFirst = client.usage.requests;
    const second = await embedDocuments({ embeddingClient: client, chunks, cachePath });
    assert.equal(first.embeddedItems, 2);
    assert.equal(second.cacheHits, 2);
    assert.equal(second.embeddedItems, 0);
    assert.equal(client.usage.requests, requestsAfterFirst);
    assert.deepEqual(second.vectors, first.vectors);
});

test("real OpenAI RAG evaluation remains explicitly gated and validates server configuration", () => {
    assert.throws(() => requireEvaluationConfiguration({}), /RUN_OPENAI_RAG_EVAL=1/);
    assert.throws(() => requireEvaluationConfiguration({ RUN_OPENAI_RAG_EVAL: "1" }),
        /OPENAI_API_KEY/);
    assert.doesNotThrow(() => requireEvaluationConfiguration({
        RUN_OPENAI_RAG_EVAL: "1",
        OPENAI_API_KEY: "server-only-test-key",
        OPENAI_EMBEDDING_MODEL: "embedding-test-model",
        OPENAI_MODEL_STANDARD: "generation-test-model"
    }));
});

test("OpenAI client exposes optional token usage without changing its string response", async () => {
    let capturedUsage;
    const client = createOpenAiClient({
        apiKey: "server-only-test-key",
        models: { fast: "fast", standard: "standard", advanced: "advanced" },
        timeoutMs: 1000,
        client: {
            responses: {
                async create() {
                    return {
                        output_text: '{"answer":"Grounded.","supportType":"grounded"}',
                        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 }
                    };
                }
            }
        },
        onUsage(usage) { capturedUsage = usage; }
    });
    const response = await client.generate("prompt", { tier: "standard" });
    assert.equal(typeof response, "string");
    assert.deepEqual(capturedUsage, {
        model: "standard",
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18
    });
});
