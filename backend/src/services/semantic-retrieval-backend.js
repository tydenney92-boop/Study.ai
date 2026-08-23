function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) ||
        left.length === 0 || left.length !== right.length) return null;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index++) {
        if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) return null;
        dot += left[index] * right[index];
        leftMagnitude += left[index] ** 2;
        rightMagnitude += right[index] ** 2;
    }
    if (leftMagnitude === 0 || rightMagnitude === 0) return null;
    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function rankSemanticChunks({
    candidates,
    queryVector,
    materialIds,
    limit,
    minimumSimilarity
}) {
    const materialOrder = new Map(materialIds.map((id, index) => [id, index]));
    return candidates.map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.vector),
        _materialOrder: materialOrder.get(chunk.materialId) ?? Number.MAX_SAFE_INTEGER
    })).filter(result => result.score !== null && result.score >= minimumSimilarity)
        .sort((left, right) =>
            right.score - left.score ||
            left._materialOrder - right._materialOrder ||
            left.chunkIndex - right.chunkIndex ||
            left.chunkId - right.chunkId
        )
        .slice(0, limit)
        .map(({ vector, vectorJson, _materialOrder, ...result }) => ({
            ...result,
            score: Number(result.score.toFixed(6))
        }));
}

function createSemanticRetrievalBackend({
    embeddingsRepository,
    embeddingClient,
    embeddingVersion,
    minimumSimilarity,
    output = console
}) {
    return {
        mode: "semantic",
        async retrieve({ courseId, userId, materialIds, query, limit }) {
            const candidates = embeddingsRepository.listCandidates({
                courseId,
                userId,
                materialIds,
                provider: embeddingClient.provider,
                model: embeddingClient.model,
                embeddingVersion
            });
            if (candidates.length === 0) {
                const error = new Error("No eligible embeddings are available.");
                error.code = "EMBEDDINGS_UNAVAILABLE";
                throw error;
            }
            const started = process.hrtime.bigint();
            try {
                const embedded = await embeddingClient.embed([query]);
                const results = rankSemanticChunks({
                    candidates,
                    queryVector: embedded.vectors[0],
                    materialIds,
                    limit,
                    minimumSimilarity
                });
                output.log(JSON.stringify({
                    level: "info",
                    event: "embedding_query",
                    provider: embeddingClient.provider,
                    model: embeddingClient.model,
                    queryEmbeddings: 1,
                    retries: 0,
                    failures: 0,
                    resultCount: results.length,
                    durationMs: Number(
                        (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)
                    )
                }));
                return attachRetrievalMetadata(results, {
                    mode: "semantic",
                    requestedMode: "semantic",
                    fallbackOccurred: false
                });
            } catch (error) {
                output.log(JSON.stringify({
                    level: "error",
                    event: "embedding_query",
                    provider: embeddingClient.provider,
                    model: embeddingClient.model,
                    queryEmbeddings: 1,
                    retries: 0,
                    failures: 1,
                    durationMs: Number(
                        (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)
                    ),
                    errorCode: error.code || "EMBEDDING_QUERY_FAILED"
                }));
                throw error;
            }
        }
    };
}

module.exports = {
    cosineSimilarity,
    createSemanticRetrievalBackend,
    rankSemanticChunks
};
const { attachRetrievalMetadata } = require("./retrieval-result");
