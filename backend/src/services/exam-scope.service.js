const { rankLexicalChunks } = require("./lexical-retrieval-backend");

const EXPLICIT_SCOPE = /\b(?:exam|midterm|final|test|review|learning objectives?)\b[^.!?\n]{0,220}\b(?:covers?|includes?|focus(?:es)? on|tested on|know|understand|identify|explain|apply)\b|\b(?:will be tested|tested on)\b/i;

function sentences(text) {
    return String(text || "").split(/(?<=[.!?])\s+|\n+/)
        .map(value => value.replace(/\s+/g, " ").trim())
        .filter(value => value.length >= 12 && value.length <= 500);
}

function topicLabels(statement) {
    const match = statement.match(/\b(?:covers?|includes?|focus(?:es)? on|tested on|know|understand|identify|explain|apply)\b\s*[:\-]?\s*(.+)$/i);
    if (!match) return [];
    const tail = match[1].replace(/[.;]+$/, "").trim();
    const parts = tail.split(/,|\band\b/i).map(value => value.trim())
        .filter(value => value.length >= 3 && value.split(/\s+/).length <= 12);
    return parts.length ? parts.slice(0, 12) : [tail];
}

function createExamScopeService({ chunksRepository }) {
    return {
        statements({ courseId, userId, sourceMaterials }) {
            if (!sourceMaterials.length) return [];
            const materialIds = sourceMaterials.map(material => material.id);
            const candidates = chunksRepository.listCandidates({ courseId, userId, materialIds });
            const ranked = rankLexicalChunks({
                candidates,
                materialIds,
                query: "exam midterm final test review covers includes tested learning objectives know understand",
                limit: 20
            });
            const sourceText = ranked.length
                ? ranked.map(chunk => ({ materialId: chunk.materialId, materialName: chunk.materialName, text: chunk.text }))
                : sourceMaterials.map(material => ({
                    materialId: material.id, materialName: material.name, text: material.extractedText
                }));
            const seen = new Set();
            const results = [];
            sourceText.forEach(source => sentences(source.text).forEach(statement => {
                if (!EXPLICIT_SCOPE.test(statement)) return;
                const key = `${source.materialId}:${statement.toLowerCase()}`;
                if (seen.has(key)) return;
                seen.add(key);
                results.push({
                    materialId: source.materialId,
                    materialName: source.materialName,
                    statement,
                    topics: topicLabels(statement)
                });
            }));
            return results.slice(0, 20);
        }
    };
}

module.exports = { EXPLICIT_SCOPE, createExamScopeService, topicLabels };
