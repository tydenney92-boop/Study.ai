const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createTextExtractionService } = require("../src/services/text-extraction.service");
const { materialTypeFor } = require("../src/services/material-type");
const { createDocumentChunker } = require("../src/services/document-chunking.service");
const { normalizeSourceText } = require("../src/services/source-text-normalization");
const { rankLexicalChunks } = require("../src/services/lexical-retrieval-backend");
const { rankSemanticChunks } = require("../src/services/semantic-retrieval-backend");
const { combineHybridResults } = require("../src/services/hybrid-retrieval-backend");
const { buildRetrievedContext } = require("../src/services/ask-notes-retrieval-context.service");
const { buildAskNotesPrompt } = require("../src/services/ai-prompts");
const { parseJsonResponse, validateAskNotesAnswer } = require("../src/services/ai-response-validation");
const { NOT_FOUND_ANSWER } = require("../src/services/ask-notes.service");

const SUPPORTED_CATEGORIES = new Set([
    "exact_recall", "paraphrase", "synonym", "concept_explanation", "cross_material",
    "specific_detail", "unsupported", "distractor_topic", "prompt_injection_source"
]);

function readManifest(manifestPath) {
    const absolutePath = path.resolve(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    if (!Array.isArray(manifest.materials) || manifest.materials.length === 0 ||
        !Array.isArray(manifest.questions) || manifest.questions.length === 0) {
        throw new Error("The evaluation manifest requires non-empty materials and questions arrays.");
    }
    const materialKeys = new Set(manifest.materials.map(material => material.id));
    if (materialKeys.size !== manifest.materials.length) {
        throw new Error("Evaluation material IDs must be unique.");
    }
    manifest.questions.forEach(question => {
        if (!question.id || !SUPPORTED_CATEGORIES.has(question.category) || !question.question ||
            !Array.isArray(question.materialIds) || question.materialIds.length === 0 ||
            question.materialIds.some(id => !materialKeys.has(id))) {
            throw new Error(`Evaluation question ${question.id || "unknown"} is invalid.`);
        }
    });
    return { manifest, absolutePath };
}

async function loadCorpus(manifestPath) {
    const { manifest, absolutePath } = readManifest(manifestPath);
    const root = path.dirname(absolutePath);
    const extractionService = createTextExtractionService({
        fileStorage: { read: filename => fs.promises.readFile(filename) }
    });
    const chunker = createDocumentChunker();
    const materials = [];
    const chunks = [];
    let nextChunkId = 1;

    for (const [index, definition] of manifest.materials.entries()) {
        const filePath = path.resolve(root, definition.path);
        const extraction = await extractionService.extract({
            storedFilename: filePath,
            originalFilename: path.basename(filePath),
            materialType: materialTypeFor(filePath)
        });
        if (extraction.status !== "extracted") {
            throw new Error(`Evaluation material ${definition.id} has no usable extracted text.`);
        }
        const material = {
            materialId: index + 1,
            materialKey: definition.id,
            materialName: definition.name || path.basename(filePath),
            path: filePath,
            text: normalizeSourceText(extraction.text)
        };
        materials.push(material);
        chunker.chunk(material.text).forEach(chunk => chunks.push({
            ...chunk,
            chunkId: nextChunkId++,
            materialId: material.materialId,
            materialKey: material.materialKey,
            materialName: material.materialName
        }));
    }
    return { name: manifest.name || path.basename(root), materials, chunks, questions: manifest.questions };
}

function expectedChunkIds(question, chunks) {
    const markers = question.expectedText || [];
    if (markers.length === 0) return [];
    const ids = [];
    markers.forEach(marker => {
        const match = chunks.find(chunk =>
            question.materialIds.includes(chunk.materialKey) &&
            chunk.text.toLowerCase().includes(String(marker).toLowerCase())
        );
        if (!match) throw new Error(`Expected text marker was not found for ${question.id}: ${marker}`);
        ids.push(match.chunkId);
    });
    return [...new Set(ids)];
}

function summarizeRetrieval(results, materialById) {
    return results.map((chunk, index) => ({
        rank: index + 1,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        score: chunk.score,
        materialId: materialById.get(chunk.materialId).materialKey,
        materialName: chunk.materialName
    }));
}

function calculateMetrics(cases, limit) {
    const relevant = cases.filter(item => item.expectedChunkIds.length > 0);
    const irrelevant = cases.filter(item => item.expectedChunkIds.length === 0);
    const recall = k => relevant.length === 0 ? 0 : relevant.reduce((sum, item) => {
        const expected = new Set(item.expectedChunkIds);
        const found = new Set(item.results.slice(0, k)
            .map(result => result.chunkId).filter(id => expected.has(id)));
        return sum + found.size / expected.size;
    }, 0) / relevant.length;
    const mrr = relevant.length === 0 ? 0 : relevant.reduce((sum, item) => {
        const expected = new Set(item.expectedChunkIds);
        const index = item.results.findIndex(result => expected.has(result.chunkId));
        return sum + (index < 0 ? 0 : 1 / (index + 1));
    }, 0) / relevant.length;
    return {
        recallAt1: recall(1),
        recallAt3: recall(3),
        recallAt6: recall(Math.min(6, limit)),
        meanReciprocalRank: mrr,
        notFoundAccuracy: irrelevant.length === 0 ? 1 : irrelevant.filter(item =>
            item.results.length === 0
        ).length / irrelevant.length
    };
}

function fullMaterialContext(materials) {
    return materials.map(material =>
        `<source_document id="material-${material.materialId}" name=${JSON.stringify(material.materialName)} characters="${material.text.length}">\n${material.text}\n</source_document>`
    ).join("\n\n");
}

function controlledNotFound() {
    return { answer: NOT_FOUND_ANSWER, supportType: "not_found", usage: null, latencyMs: 0 };
}

async function embedDocuments({ embeddingClient, chunks, cachePath, batchSize = 32 }) {
    const modelKey = `${embeddingClient.provider}:${embeddingClient.model}`;
    let cache = { version: 1, entries: {} };
    if (cachePath && fs.existsSync(cachePath)) {
        cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    }
    const vectors = Array(chunks.length);
    const missing = [];
    chunks.forEach((chunk, index) => {
        const key = crypto.createHash("sha256").update(`${modelKey}\n${chunk.text}`).digest("hex");
        const cached = cache.entries[key];
        if (Array.isArray(cached) && cached.length > 0) vectors[index] = cached;
        else missing.push({ index, key, text: chunk.text });
    });
    for (let index = 0; index < missing.length; index += batchSize) {
        const batch = missing.slice(index, index + batchSize);
        const result = await embeddingClient.embed(batch.map(item => item.text));
        batch.forEach((item, batchIndex) => {
            vectors[item.index] = result.vectors[batchIndex];
            cache.entries[item.key] = result.vectors[batchIndex];
        });
    }
    if (cachePath && missing.length > 0) {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);
    }
    return { vectors, cacheHits: chunks.length - missing.length, embeddedItems: missing.length };
}

async function generateReviewedAnswer({ generator, prompt, question, variant }) {
    const started = process.hrtime.bigint();
    const generated = await generator({ prompt, question, variant });
    const result = validateAskNotesAnswer(parseJsonResponse(generated.text));
    return {
        answer: result.supportType === "not_found" ? NOT_FOUND_ANSWER : result.answer,
        supportType: result.supportType,
        usage: generated.usage || null,
        latencyMs: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(1))
    };
}

async function runAskNotesEvaluation({
    manifestPath,
    embeddingClient,
    answerGenerator,
    topK = 6,
    minimumSimilarity = 0.15,
    hybridSemanticWeight = 0.65,
    maxContextCharacters = 100000,
    answerMode = "semantic",
    embeddingCachePath = null,
    embeddingBatchSize = 32
}) {
    const corpus = await loadCorpus(manifestPath);
    const materialByKey = new Map(corpus.materials.map(material => [material.materialKey, material]));
    const materialById = new Map(corpus.materials.map(material => [material.materialId, material]));
    const embeddingUsageBefore = { ...embeddingClient.usage };
    const documentEmbedding = await embedDocuments({
        embeddingClient,
        chunks: corpus.chunks,
        cachePath: embeddingCachePath,
        batchSize: embeddingBatchSize
    });
    const embeddedChunks = corpus.chunks.map((chunk, index) => ({
        ...chunk,
        vector: documentEmbedding.vectors[index]
    }));
    const casesByMode = { lexical: [], semantic: [], hybrid: [] };
    const questionReports = [];
    let generativeRequests = 0;
    let generativeInputTokens = 0;
    let generativeOutputTokens = 0;

    for (const question of corpus.questions) {
        const allowedMaterialIds = question.materialIds.map(key => materialByKey.get(key).materialId);
        const candidates = corpus.chunks.filter(chunk => allowedMaterialIds.includes(chunk.materialId));
        const embeddedCandidates = embeddedChunks.filter(chunk => allowedMaterialIds.includes(chunk.materialId));
        const expected = expectedChunkIds(question, corpus.chunks);
        const lexicalStarted = process.hrtime.bigint();
        const lexical = rankLexicalChunks({
            candidates, materialIds: allowedMaterialIds, query: question.question, limit: topK
        });
        const lexicalLatency = Number((Number(process.hrtime.bigint() - lexicalStarted) / 1e6).toFixed(1));
        let semantic;
        let semanticLatency;
        let fallbackOccurred = false;
        try {
            const semanticStarted = process.hrtime.bigint();
            const queryEmbedding = await embeddingClient.embed([question.question]);
            semantic = rankSemanticChunks({
                candidates: embeddedCandidates,
                queryVector: queryEmbedding.vectors[0],
                materialIds: allowedMaterialIds,
                limit: topK,
                minimumSimilarity
            });
            semanticLatency = Number((Number(process.hrtime.bigint() - semanticStarted) / 1e6).toFixed(1));
        } catch (error) {
            semantic = lexical;
            semanticLatency = lexicalLatency;
            fallbackOccurred = true;
        }
        const hybridStarted = process.hrtime.bigint();
        const hybrid = combineHybridResults({
            lexical, semantic, semanticWeight: hybridSemanticWeight, limit: topK
        });
        const hybridLatency = semanticLatency + Number(
            (Number(process.hrtime.bigint() - hybridStarted) / 1e6).toFixed(1)
        );
        const modes = {
            lexical: { results: lexical, latencyMs: lexicalLatency, fallbackOccurred: false },
            semantic: { results: semantic, latencyMs: semanticLatency, fallbackOccurred },
            hybrid: { results: hybrid, latencyMs: hybridLatency, fallbackOccurred }
        };
        Object.entries(modes).forEach(([mode, value]) => casesByMode[mode].push({
            questionId: question.id,
            expectedChunkIds: expected,
            results: value.results
        }));

        const selectedMode = modes[answerMode];
        const built = buildRetrievedContext({
            retrieved: selectedMode.results,
            maxContextCharacters
        });
        const selectedMaterials = question.materialIds.map(key => materialByKey.get(key));
        const fullContext = fullMaterialContext(selectedMaterials);
        let retrievedAnswer = controlledNotFound();
        if (built.chunks.length > 0 && answerGenerator) {
            retrievedAnswer = await generateReviewedAnswer({
                generator: answerGenerator,
                prompt: buildAskNotesPrompt(built.courseContent, question.question),
                question,
                variant: "retrieval"
            });
            generativeRequests++;
        }
        let fullAnswer = null;
        if (answerGenerator) {
            fullAnswer = await generateReviewedAnswer({
                generator: answerGenerator,
                prompt: buildAskNotesPrompt(fullContext, question.question),
                question,
                variant: "full_context"
            });
            generativeRequests++;
        }
        for (const answer of [retrievedAnswer, fullAnswer].filter(Boolean)) {
            generativeInputTokens += answer.usage?.inputTokens || 0;
            generativeOutputTokens += answer.usage?.outputTokens || 0;
        }
        questionReports.push({
            id: question.id,
            category: question.category,
            question: question.question,
            expectedBehavior: question.expectedBehavior,
            referenceAnswer: question.referenceAnswer || null,
            expectedMaterialIds: question.expectedMaterialIds || [],
            expectedChunkIds: expected,
            retrieval: Object.fromEntries(Object.entries(modes).map(([mode, value]) => [mode, {
                chunks: summarizeRetrieval(value.results, materialById),
                latencyMs: value.latencyMs,
                fallbackOccurred: value.fallbackOccurred
            }])),
            comparison: {
                retrievalContextCharacters: built.courseContent.length,
                fullContextCharacters: fullContext.length,
                contextReduction: fullContext.length === 0 ? 0 :
                    1 - built.courseContent.length / fullContext.length,
                retrievedSources: built.sources.map(source => ({
                    materialId: materialById.get(source.materialId).materialKey,
                    materialName: source.name,
                    chunkIds: source.chunkIds
                })),
                retrievalAnswer: retrievedAnswer,
                fullContextAnswer: fullAnswer
            },
            humanReview: {
                retrievalAnswer: null,
                fullContextAnswer: null,
                notes: ""
            }
        });
    }

    const average = values => values.length === 0 ? 0 :
        values.reduce((sum, value) => sum + value, 0) / values.length;
    const reductions = questionReports.map(item => item.comparison.contextReduction);
    const supportBehaviorAccuracy = variant => average(questionReports.map(item => {
        const answer = item.comparison[variant];
        if (!answer) return 0;
        return item.expectedBehavior === "not_found"
            ? Number(answer.supportType === "not_found")
            : Number(answer.supportType !== "not_found");
    }));
    const unsupportedQuestions = questionReports.filter(item =>
        item.expectedBehavior === "not_found"
    );
    const answerNotFoundAccuracy = variant => unsupportedQuestions.length === 0 ? 1 :
        average(unsupportedQuestions.map(item => Number(
            item.comparison[variant]?.supportType === "not_found"
        )));
    const groundedQuestions = questionReports.filter(item =>
        item.expectedBehavior !== "not_found"
    );
    const sourceAttributionRecall = groundedQuestions.length === 0 ? 1 : average(
        groundedQuestions.map(item => {
            const expected = new Set(item.expectedMaterialIds);
            if (expected.size === 0) return 1;
            const actual = new Set(item.comparison.retrievedSources.map(source => source.materialId));
            return [...expected].filter(id => actual.has(id)).length / expected.size;
        })
    );
    const embeddingUsage = embeddingClient.usage ? {
        requests: embeddingClient.usage.requests - (embeddingUsageBefore.requests || 0),
        items: embeddingClient.usage.items - (embeddingUsageBefore.items || 0),
        totalTokens: embeddingClient.usage.totalTokens - (embeddingUsageBefore.totalTokens || 0)
    } : null;
    return {
        generatedAt: new Date().toISOString(),
        corpus: {
            name: corpus.name,
            materialCount: corpus.materials.length,
            chunkCount: corpus.chunks.length,
            questionCount: corpus.questions.length,
            formats: [...new Set(corpus.materials.map(material => path.extname(material.path).toLowerCase()))]
        },
        settings: { topK, minimumSimilarity, hybridSemanticWeight, answerMode },
        retrievalMetrics: Object.fromEntries(Object.entries(casesByMode).map(([mode, cases]) => [
            mode, calculateMetrics(cases, topK)
        ])),
        retrievalMetricsByCategory: Object.fromEntries(Object.entries(casesByMode).map(
            ([mode, cases]) => [mode, Object.fromEntries(SUPPORTED_CATEGORIES.values().map(category => [
                category,
                calculateMetrics(cases.filter(item =>
                    corpus.questions.find(question => question.id === item.questionId).category === category
                ), topK)
            ]))]
        )),
        summary: {
            averageContextReduction: average(reductions),
            averageRetrievalContextCharacters: average(questionReports.map(
                item => item.comparison.retrievalContextCharacters
            )),
            averageFullContextCharacters: average(questionReports.map(
                item => item.comparison.fullContextCharacters
            )),
            embeddingUsage,
            embeddingCache: {
                documentCacheHits: documentEmbedding.cacheHits,
                documentEmbeddedItems: documentEmbedding.embeddedItems
            },
            generativeUsage: {
                requests: generativeRequests,
                inputTokens: generativeInputTokens,
                outputTokens: generativeOutputTokens
            },
            retrievalAnswerBehaviorAccuracy: supportBehaviorAccuracy("retrievalAnswer"),
            fullContextAnswerBehaviorAccuracy: supportBehaviorAccuracy("fullContextAnswer"),
            retrievalAnswerNotFoundAccuracy: answerNotFoundAccuracy("retrievalAnswer"),
            fullContextAnswerNotFoundAccuracy: answerNotFoundAccuracy("fullContextAnswer"),
            retrievedSourceAttributionRecall: sourceAttributionRecall,
            averageRetrievalLatencyMs: Object.fromEntries(["lexical", "semantic", "hybrid"].map(
                mode => [mode, average(questionReports.map(item => item.retrieval[mode].latencyMs))]
            )),
            averageAnswerLatencyMs: {
                retrieval: average(questionReports.map(
                    item => item.comparison.retrievalAnswer.latencyMs
                )),
                fullContext: average(questionReports.map(
                    item => item.comparison.fullContextAnswer?.latencyMs || 0
                ))
            }
        },
        questions: questionReports
    };
}

module.exports = {
    SUPPORTED_CATEGORIES,
    calculateMetrics,
    embedDocuments,
    loadCorpus,
    readManifest,
    runAskNotesEvaluation
};
