function normalizeScores(results) {
    const maximum = Math.max(...results.map(result => result.score), 0);
    if (maximum <= 0) return new Map();
    return new Map(results.map(result => [result.chunkId, result.score / maximum]));
}

function combineHybridResults({ lexical, semantic, semanticWeight, limit }) {
    const lexicalScores = normalizeScores(lexical);
    const semanticScores = new Map(semantic.map(result => [
        result.chunkId,
        Math.max(0, Math.min(1, (result.score + 1) / 2))
    ]));
    const chunks = new Map();
    [...lexical, ...semantic].forEach(result => chunks.set(result.chunkId, result));
    return [...chunks.values()].map(result => ({
        ...result,
        score: Number((
            (lexicalScores.get(result.chunkId) || 0) * (1 - semanticWeight) +
            (semanticScores.get(result.chunkId) || 0) * semanticWeight
        ).toFixed(6))
    })).sort((left, right) =>
        right.score - left.score ||
        left.chunkIndex - right.chunkIndex ||
        left.chunkId - right.chunkId
    ).slice(0, limit);
}

function createHybridRetrievalBackend({ lexicalBackend, semanticBackend, semanticWeight }) {
    return {
        mode: "hybrid",
        async retrieve(input) {
            const candidateLimit = Math.max(input.limit * 4, 20);
            const [lexical, semantic] = await Promise.all([
                lexicalBackend.retrieve({ ...input, limit: candidateLimit }),
                semanticBackend.retrieve({ ...input, limit: candidateLimit })
            ]);
            return combineHybridResults({
                lexical,
                semantic,
                semanticWeight,
                limit: input.limit
            });
        }
    };
}

module.exports = { combineHybridResults, createHybridRetrievalBackend, normalizeScores };
