const { AppError } = require("../utils/app-error");
const { normalizeSourceText } = require("./source-text-normalization");
const { retrievalMetadata } = require("./retrieval-result");

const DEFAULT_REDUNDANCY_THRESHOLD = 0.9;

function termSet(text) {
    return new Set(normalizeSourceText(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function similarity(left, right) {
    const leftTerms = termSet(left);
    const rightTerms = termSet(right);
    if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
    let intersection = 0;
    leftTerms.forEach(term => {
        if (rightTerms.has(term)) intersection++;
    });
    return intersection / new Set([...leftTerms, ...rightTerms]).size;
}

function chunkBlock(chunk) {
    return `<retrieved_chunk material_id="${chunk.materialId}" material_name=${JSON.stringify(chunk.materialName)} chunk_id="${chunk.chunkId}" chunk_index="${chunk.chunkIndex}">\n${chunk.text}\n</retrieved_chunk>`;
}

function buildRetrievedContext({
    retrieved,
    maxContextCharacters,
    redundancyThreshold = DEFAULT_REDUNDANCY_THRESHOLD
}) {
    const supplied = [];
    let courseContent = "";
    for (const chunk of retrieved) {
        if (supplied.some(existing =>
            existing.materialId === chunk.materialId &&
            similarity(existing.text, chunk.text) >= redundancyThreshold
        )) continue;
        const block = chunkBlock(chunk);
        const candidate = courseContent ? `${courseContent}\n\n${block}` : block;
        if (candidate.length > maxContextCharacters) {
            if (supplied.length === 0) {
                throw new AppError({
                    code: "AI_CONTEXT_TOO_LARGE",
                    message: "The retrieved material exceeds the AI context limit.",
                    status: 413,
                    details: {
                        contextCharacters: candidate.length,
                        maxContextCharacters
                    }
                });
            }
            break;
        }
        supplied.push(chunk);
        courseContent = candidate;
    }
    const sources = [];
    const sourceByMaterial = new Map();
    supplied.forEach(chunk => {
        let source = sourceByMaterial.get(chunk.materialId);
        if (!source) {
            source = { materialId: chunk.materialId, name: chunk.materialName, chunkIds: [] };
            sourceByMaterial.set(chunk.materialId, source);
            sources.push(source);
        }
        source.chunkIds.push(chunk.chunkId);
    });
    return { courseContent, chunks: supplied, sources };
}

function createAskNotesRetrievalContextService({
    materialContextService,
    retrievalService,
    topK,
    maxContextCharacters,
    redundancyThreshold = DEFAULT_REDUNDANCY_THRESHOLD,
    output = console
}) {
    return {
        async resolve({ courseId, userId, materialIds, question }) {
            const selected = materialContextService.resolveMaterials({
                courseId,
                userId,
                materialIds
            }, { includeText: false });
            const fullContextCharacters = selected.materials.reduce(
                (total, material) => total + material.text_length,
                0
            );
            const started = process.hrtime.bigint();
            const retrieved = await retrievalService.retrieveRelevantChunks({
                courseId,
                userId,
                materialIds: selected.materialIds,
                query: question,
                limit: topK
            });
            const metadata = retrievalMetadata(retrieved);
            const built = buildRetrievedContext({
                retrieved,
                maxContextCharacters,
                redundancyThreshold
            });
            const { chunks: supplied, courseContent, sources } = built;

            const durationMs = Number(
                (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)
            );
            output.log(JSON.stringify({
                level: "info",
                event: "ask_notes_retrieval",
                retrievalMode: metadata.mode,
                requestedRetrievalMode: metadata.requestedMode,
                fallbackOccurred: metadata.fallbackOccurred,
                selectedMaterialCount: selected.materialIds.length,
                chunksRetrieved: retrieved.length,
                chunksSupplied: supplied.length,
                contextCharacters: courseContent.length,
                fullContextCharacters,
                retrievalDurationMs: durationMs
            }));

            return {
                materialIds: selected.materialIds,
                materials: selected.materials,
                courseContent,
                chunks: supplied,
                sources,
                retrieval: metadata,
                fullContextCharacters
            };
        }
    };
}

module.exports = {
    DEFAULT_REDUNDANCY_THRESHOLD,
    buildRetrievedContext,
    chunkBlock,
    createAskNotesRetrievalContextService,
    similarity
};
