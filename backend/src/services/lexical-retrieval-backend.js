const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "how", "in", "is", "it", "of", "on", "or", "that", "the", "their",
    "this", "to", "was", "what", "when", "where", "which", "who", "why",
    "with"
]);

function normalizeLexicalText(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function lexicalTerms(value) {
    return normalizeLexicalText(value).split(/\s+/)
        .filter(term => term && !STOP_WORDS.has(term));
}

function rankLexicalChunks({ candidates, materialIds, query, limit }) {
    const queryTerms = [...new Set(lexicalTerms(query))];
    if (queryTerms.length === 0 || candidates.length === 0) return [];
    const prepared = candidates.map(chunk => {
                const normalized = normalizeLexicalText(chunk.text);
                const terms = lexicalTerms(chunk.text);
                const frequencies = new Map();
                terms.forEach(term => frequencies.set(term, (frequencies.get(term) || 0) + 1));
                return { chunk, normalized, frequencies, termCount: Math.max(terms.length, 1) };
            });
    const documentFrequency = new Map(queryTerms.map(term => [
                term,
                prepared.filter(item => item.frequencies.has(term)).length
            ]));
    const normalizedQuery = normalizeLexicalText(query);
    const materialOrder = new Map(materialIds.map((id, index) => [id, index]));

    return prepared.map(item => {
                let score = 0;
                let matched = 0;
                for (const term of queryTerms) {
                    const frequency = item.frequencies.get(term) || 0;
                    if (frequency === 0) continue;
                    matched++;
                    const inverseFrequency = Math.log(
                        (candidates.length + 1) / ((documentFrequency.get(term) || 0) + 1)
                    ) + 1;
                    score += (1 + Math.log(frequency)) * inverseFrequency;
                }
                score += (matched / queryTerms.length) * 2;
                if (normalizedQuery.length >= 4 && item.normalized.includes(normalizedQuery)) {
                    score += 3;
                }
                return {
                    ...item.chunk,
                    score: Number(score.toFixed(6)),
                    _materialOrder: materialOrder.get(item.chunk.materialId) ?? Number.MAX_SAFE_INTEGER
                };
            }).filter(result => result.score > 0)
                .sort((left, right) =>
                    right.score - left.score ||
                    left._materialOrder - right._materialOrder ||
                    left.chunkIndex - right.chunkIndex ||
                    left.chunkId - right.chunkId
                )
                .slice(0, limit)
                .map(({ _materialOrder, ...result }) => result);
}

function createLexicalRetrievalBackend({ chunksRepository }) {
    return {
        mode: "lexical",
        retrieve({ courseId, userId, materialIds, query, limit }) {
            const candidates = chunksRepository.listCandidates({
                courseId,
                userId,
                materialIds
            });
            return attachRetrievalMetadata(
                rankLexicalChunks({ candidates, materialIds, query, limit }),
                { mode: "lexical", requestedMode: "lexical", fallbackOccurred: false }
            );
        }
    };
}

module.exports = {
    STOP_WORDS,
    createLexicalRetrievalBackend,
    lexicalTerms,
    normalizeLexicalText,
    rankLexicalChunks
};
const { attachRetrievalMetadata } = require("./retrieval-result");
