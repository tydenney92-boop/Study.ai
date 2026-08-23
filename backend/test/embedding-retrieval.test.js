const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");
const {
    createMaterialChunkEmbeddingsRepository
} = require("../src/repositories/material-chunk-embeddings.repository");
const { createEmbeddingIndexingService } = require("../src/services/embedding-indexing.service");
const { createOpenAiEmbeddingClient } = require("../src/services/openai-embedding-client");
const { createConfiguredEmbeddingClient } = require("../src/services/embedding-client-factory");
const { createConfiguredRetrievalBackend } = require("../src/services/retrieval-backend-factory");
const { createLexicalRetrievalBackend } = require("../src/services/lexical-retrieval-backend");
const { createRetrievalService } = require("../src/services/retrieval.service");
const { evaluateRetrieval } = require("../src/services/retrieval-evaluation");
const {
    candidates,
    cases,
    createDeterministicEmbeddingClient,
    deterministicVector
} = require("../evaluation/retrieval-fixtures");

function quietOutput() {
    const records = [];
    return { records, log(value) { records.push(value); } };
}

function addIndexedMaterial(context, overrides = {}) {
    const id = insertMaterial(context.database, overrides);
    const material = context.database.prepare(`
        SELECT id, course_id AS courseId, extracted_text AS extractedText,
               extraction_status AS extractionStatus
        FROM materials WHERE id = ?
    `).get(id);
    context.app.locals.materialIndexingService.rebuildMaterial(material);
    return id;
}

test("OpenAI embedding client sends configured model/dimensions once with retries disabled", async () => {
    const calls = [];
    const client = createOpenAiEmbeddingClient({
        apiKey: "server-only-secret",
        model: "configured-embedding-model",
        dimensions: 256,
        timeoutMs: 1000,
        client: {
            embeddings: {
                async create(body, options) {
                    calls.push({ body, options });
                    return {
                        data: [{ index: 0, embedding: [0.1, 0.2] }],
                        usage: { prompt_tokens: 3, total_tokens: 3 }
                    };
                }
            }
        }
    });
    const result = await client.embed(["safe input"]);
    assert.deepEqual(result.vectors, [[0.1, 0.2]]);
    assert.deepEqual(calls[0].body, {
        model: "configured-embedding-model",
        input: ["safe input"],
        encoding_format: "float",
        dimensions: 256
    });
    assert.equal(calls[0].options.maxRetries, 0);
});

test("embedding configuration stays disabled by default and fails closed without server settings", () => {
    assert.equal(createConfiguredEmbeddingClient({ embeddingsEnabled: false }), null);
    assert.throws(() => createConfiguredEmbeddingClient({
        embeddingsEnabled: true,
        embeddingsProvider: "openai",
        openAiApiKey: null,
        openAiEmbeddingModel: null
    }), error => error.code === "INVALID_EMBEDDING_CONFIG" &&
        !error.message.includes("server-only-secret"));
});

test("embedding indexing persists once, then invalidates by model, version, and content hash", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = addIndexedMaterial(context, {
        extractedText: "Opportunity cost is the best alternative forgone. ".repeat(12)
    });
    const repository = createMaterialChunkEmbeddingsRepository(context.database);
    const client = createDeterministicEmbeddingClient();
    const service = createEmbeddingIndexingService({
        repository, embeddingClient: client, embeddingVersion: 1,
        batchSize: 10, maxChunks: 100, output: quietOutput()
    });

    const first = await service.indexMaterial(materialId);
    const second = await service.indexMaterial(materialId);
    assert.ok(first.embeddedChunks > 0);
    assert.equal(second.embeddedChunks, 0);
    assert.equal(repository.count(), first.embeddedChunks);

    client.model = "deterministic-eval-v2";
    assert.equal((await service.indexMaterial(materialId)).embeddedChunks, first.embeddedChunks);
    const versioned = createEmbeddingIndexingService({
        repository, embeddingClient: client, embeddingVersion: 2,
        batchSize: 10, maxChunks: 100, output: quietOutput()
    });
    assert.equal((await versioned.indexMaterial(materialId)).embeddedChunks, first.embeddedChunks);

    context.database.prepare(`UPDATE material_chunks SET content_hash = 'changed' WHERE material_id = ?`)
        .run(materialId);
    assert.equal((await versioned.indexMaterial(materialId)).embeddedChunks, first.embeddedChunks);
});

test("provider failure preserves chunks and previously valid embeddings", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = addIndexedMaterial(context, {
        extractedText: "Demand falls as price rises. ".repeat(20)
    });
    const repository = createMaterialChunkEmbeddingsRepository(context.database);
    const good = createEmbeddingIndexingService({
        repository, embeddingClient: createDeterministicEmbeddingClient(),
        embeddingVersion: 1, batchSize: 10, maxChunks: 100, output: quietOutput()
    });
    await good.indexMaterial(materialId);
    const beforeEmbeddings = repository.count();
    const beforeChunks = context.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?"
    ).get(materialId).count;
    const failing = createEmbeddingIndexingService({
        repository,
        embeddingClient: { provider: "fake", model: "failure-v2", async embed() { throw Object.assign(new Error("down"), { code: "EMBEDDING_SERVICE_ERROR" }); } },
        embeddingVersion: 1, batchSize: 10, maxChunks: 100, output: quietOutput()
    });
    await assert.rejects(() => failing.indexMaterial(materialId), /down/);
    assert.equal(repository.count(), beforeEmbeddings);
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?"
    ).get(materialId).count, beforeChunks);
});

test("new uploads index embeddings best-effort without making provider availability an upload dependency", async t => {
    const successfulClient = createDeterministicEmbeddingClient();
    successfulClient.provider = "openai";
    successfulClient.model = "configured-test-model";
    const success = createTestApp({
        config: {
            embeddingsEnabled: true,
            embeddingVersion: 1,
            embeddingIndexBatchSize: 10,
            embeddingIndexMaxChunks: 100,
            retrievalMode: "semantic",
            retrievalMinimumSimilarity: 0.15,
            retrievalHybridSemanticWeight: 0.65
        },
        embeddingClient: successfulClient,
        embeddingOutput: quietOutput()
    });
    t.after(success.cleanup);
    const created = await authenticatedRequest(success.app)
        .post("/api/courses/1/materials")
        .field("unitId", "1")
        .attach("file", Buffer.from("Opportunity cost and scarcity. ".repeat(30)), "embedding-notes.txt")
        .expect(201);
    assert.ok(success.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunk_embeddings"
    ).get().count > 0);

    const failed = createTestApp({
        config: {
            embeddingsEnabled: true,
            embeddingVersion: 1,
            embeddingIndexBatchSize: 10,
            embeddingIndexMaxChunks: 100,
            retrievalMode: "semantic",
            retrievalMinimumSimilarity: 0.15,
            retrievalHybridSemanticWeight: 0.65
        },
        embeddingClient: {
            provider: "openai", model: "configured-test-model",
            async embed() { throw Object.assign(new Error("provider unavailable"), { code: "EMBEDDING_SERVICE_ERROR" }); }
        },
        embeddingOutput: quietOutput()
    });
    t.after(failed.cleanup);
    const failedUpload = await authenticatedRequest(failed.app)
        .post("/api/courses/1/materials")
        .field("unitId", "1")
        .attach("file", Buffer.from("Demand and supply. ".repeat(30)), "fallback-notes.txt")
        .expect(201);
    assert.equal(failedUpload.body.originalFilename, "fallback-notes.txt");
    assert.ok(failed.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?"
    ).get(failedUpload.body.id).count > 0);
    assert.equal(failed.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunk_embeddings"
    ).get().count, 0);
    assert.ok(created.body.id > 0);
});

test("semantic retrieval embeds the query once and enforces course/material ownership", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = addIndexedMaterial(context, {
        extractedText: "Opportunity cost is the value of the best alternative forgone. ".repeat(8)
    });
    const embeddingClient = createDeterministicEmbeddingClient();
    const embeddingsRepository = createMaterialChunkEmbeddingsRepository(context.database);
    await createEmbeddingIndexingService({
        repository: embeddingsRepository, embeddingClient, embeddingVersion: 1,
        batchSize: 10, maxChunks: 100, output: quietOutput()
    }).indexMaterial(materialId);
    embeddingClient.calls.length = 0;
    const backend = createConfiguredRetrievalBackend({
        config: {
            embeddingsEnabled: true, retrievalMode: "semantic", embeddingVersion: 1,
            retrievalMinimumSimilarity: 0.1, retrievalHybridSemanticWeight: 0.65
        },
        chunksRepository: require("../src/repositories/material-chunks.repository")
            .createMaterialChunksRepository(context.database),
        embeddingsRepository, embeddingClient, output: quietOutput()
    });
    const materialsRepository = require("../src/repositories/materials.repository")
        .createMaterialsRepository(context.database);
    const service = createRetrievalService({
        coursesService: { requireOwned(courseId, userId) {
            if (courseId !== 1 || userId !== 1) throw new Error("not owned");
        } },
        materialsRepository,
        retrievalBackend: backend
    });
    const results = await service.retrieveRelevantChunks({
        courseId: 1, userId: 1, materialIds: [materialId],
        query: "What sacrifice comes from the next best choice?", limit: 3
    });
    assert.ok(results.length > 0);
    assert.equal(embeddingClient.calls.length, 1);
    assert.throws(() => service.retrieveRelevantChunks({
        courseId: 1, userId: 1, materialIds: [9999], query: "cost", limit: 3
    }), error => error.code === "MATERIAL_CONTEXT_INVALID");
});

test("disabled and failed semantic retrieval safely use lexical results", async () => {
    const chunksRepository = { listCandidates() { return candidates; } };
    const lexical = createConfiguredRetrievalBackend({
        config: { embeddingsEnabled: false, retrievalMode: "semantic" },
        chunksRepository
    });
    assert.equal(lexical.mode, "lexical");
    assert.equal((await lexical.retrieve({
        courseId: 1, userId: 1, materialIds: [1, 2], query: "opportunity cost", limit: 2
    }))[0].chunkId, 1);

    const fallback = createConfiguredRetrievalBackend({
        config: {
            embeddingsEnabled: true, retrievalMode: "semantic", embeddingVersion: 1,
            retrievalMinimumSimilarity: 0.1, retrievalHybridSemanticWeight: 0.65
        },
        chunksRepository,
        embeddingsRepository: { listCandidates() { return [{ ...candidates[0], vector: [1] }]; } },
        embeddingClient: { provider: "fake", model: "broken", async embed() { throw new Error("offline"); } },
        output: quietOutput()
    });
    assert.equal((await fallback.retrieve({
        courseId: 1, userId: 1, materialIds: [1], query: "opportunity cost", limit: 2
    }))[0].chunkId, 1);
});

test("deterministic retrieval evaluation compares lexical, semantic, and hybrid", async () => {
    const client = createDeterministicEmbeddingClient();
    const vectors = (await client.embed(candidates.map(item => item.text))).vectors;
    const embedded = candidates.map((item, index) => ({ ...item, vector: vectors[index] }));
    const { rankLexicalChunks } = require("../src/services/lexical-retrieval-backend");
    const { rankSemanticChunks } = require("../src/services/semantic-retrieval-backend");
    const { combineHybridResults } = require("../src/services/hybrid-retrieval-backend");
    const lexical = item => rankLexicalChunks({ candidates: candidates.filter(c => item.materialIds.includes(c.materialId)), ...item, limit: 3 });
    const semantic = item => rankSemanticChunks({
        candidates: embedded.filter(c => item.materialIds.includes(c.materialId)),
        queryVector: deterministicVector(item.query), materialIds: item.materialIds,
        limit: 3, minimumSimilarity: 0.15
    });
    const hybrid = item => combineHybridResults({ lexical: lexical(item), semantic: semantic(item), semanticWeight: 0.65, limit: 3 });
    const metrics = {
        lexical: await evaluateRetrieval({ cases, retrieve: lexical }),
        semantic: await evaluateRetrieval({ cases, retrieve: semantic }),
        hybrid: await evaluateRetrieval({ cases, retrieve: hybrid })
    };
    assert.ok(metrics.semantic.recallAt1 >= metrics.lexical.recallAt1);
    assert.ok(metrics.hybrid.recallAt3 >= metrics.lexical.recallAt3);
    assert.equal(metrics.semantic.irrelevantAccuracy, 1);
});

test("embedding usage logs contain metadata but never input text or credentials", async () => {
    const output = quietOutput();
    const repository = {
        listStale() { return [{ chunkId: 1, text: "PRIVATE SOURCE TEXT", contentHash: "hash" }]; },
        upsertMany() {}
    };
    await createEmbeddingIndexingService({
        repository,
        embeddingClient: {
            provider: "openai", model: "configured-model",
            async embed() { return { vectors: [[1, 0]], usage: { totalTokens: 4 } }; }
        },
        embeddingVersion: 1, batchSize: 10, maxChunks: 100, output
    }).indexStale();
    const logged = output.records.join("\n");
    assert.match(logged, /configured-model/);
    assert.match(logged, /"items":1/);
    assert.doesNotMatch(logged, /PRIVATE SOURCE TEXT|OPENAI_API_KEY|server-only-secret/);
});
