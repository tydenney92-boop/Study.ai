const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "how", "in", "is", "it", "of", "on", "or", "that", "the", "their",
    "this", "to", "was", "what", "when", "where", "which", "who", "why",
    "with"
]);

const QUERY_SYNONYM_GROUPS = [
    ["elasticity", "responsiveness", "sensitivity"],
    ["monopoly", "monopolist"],
    ["unemployment", "joblessness"],
    ["increase", "rise", "growth"],
    ["decrease", "decline", "reduction"],
    ["cause", "reason"],
    ["effect", "impact", "consequence"],
    ["compare", "contrast", "difference"],
    ["example", "illustration"]
];

const SYNONYMS = new Map();
for (const group of QUERY_SYNONYM_GROUPS) {
    for (const term of group) {
        SYNONYMS.set(term, group.filter(candidate => candidate !== term));
    }
}

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

function boundedEditDistance(left, right, maximum) {
    if (left === right) return 0;
    if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
    let previousPrevious = null;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        const current = [leftIndex];
        let rowMinimum = current[0];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            const substitution = previous[rightIndex - 1] +
                Number(left[leftIndex - 1] !== right[rightIndex - 1]);
            let distance = Math.min(
                previous[rightIndex] + 1,
                current[rightIndex - 1] + 1,
                substitution
            );
            if (
                previousPrevious && leftIndex > 1 && rightIndex > 1 &&
                left[leftIndex - 1] === right[rightIndex - 2] &&
                left[leftIndex - 2] === right[rightIndex - 1]
            ) {
                distance = Math.min(distance, previousPrevious[rightIndex - 2] + 1);
            }
            current.push(distance);
            rowMinimum = Math.min(rowMinimum, distance);
        }
        if (rowMinimum > maximum) return maximum + 1;
        previousPrevious = previous;
        previous = current;
    }
    return previous[right.length];
}

function fuzzyTolerance(term) {
    if (term.length < 5) return 0;
    return term.length >= 9 ? 2 : 1;
}

function bestTermMatch(queryTerm, frequencies) {
    const exactFrequency = frequencies.get(queryTerm);
    if (exactFrequency) return { frequency: exactFrequency, weight: 1, matchedTerm: queryTerm };

    for (const synonym of SYNONYMS.get(queryTerm) || []) {
        const frequency = frequencies.get(synonym);
        if (frequency) return { frequency, weight: 0.55, matchedTerm: synonym };
    }

    const tolerance = fuzzyTolerance(queryTerm);
    if (!tolerance) return null;
    let best = null;
    for (const [candidate, frequency] of frequencies) {
        if (candidate.length < 4) continue;
        const distance = boundedEditDistance(queryTerm, candidate, tolerance);
        if (distance > tolerance) continue;
        if (!best || distance < best.distance ||
            (distance === best.distance && frequency > best.frequency)) {
            best = { frequency, distance, matchedTerm: candidate };
        }
    }
    return best ? {
        frequency: best.frequency,
        weight: best.distance === 1 ? 0.72 : 0.48,
        matchedTerm: best.matchedTerm
    } : null;
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
                prepared.filter(item => bestTermMatch(term, item.frequencies)).length
            ]));
    const normalizedQuery = normalizeLexicalText(query);
    const materialOrder = new Map(materialIds.map((id, index) => [id, index]));

    return prepared.map(item => {
                let score = 0;
                let matched = 0;
                for (const term of queryTerms) {
                    const match = bestTermMatch(term, item.frequencies);
                    if (!match) continue;
                    matched++;
                    const inverseFrequency = Math.log(
                        (candidates.length + 1) / ((documentFrequency.get(term) || 0) + 1)
                    ) + 1;
                    score += (1 + Math.log(match.frequency)) * inverseFrequency * match.weight;
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
    SYNONYMS,
    bestTermMatch,
    boundedEditDistance,
    createLexicalRetrievalBackend,
    lexicalTerms,
    normalizeLexicalText,
    rankLexicalChunks
};
const { attachRetrievalMetadata } = require("./retrieval-result");
