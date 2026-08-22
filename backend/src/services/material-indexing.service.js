const crypto = require("crypto");
const { normalizeSourceText } = require("./source-text-normalization");

const CHUNKING_VERSION = 1;

function contentHash(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

function createMaterialIndexingService({ chunksRepository, documentChunker }) {
    function rebuildMaterial(material) {
        const normalized = normalizeSourceText(material.extractedText);
        if (material.extractionStatus !== "extracted" || !normalized) {
            chunksRepository.replaceForMaterial({
                materialId: material.id,
                courseId: material.courseId,
                chunks: [],
                contentHash: contentHash(normalized),
                chunkingVersion: CHUNKING_VERSION
            });
            return { materialId: material.id, chunkCount: 0, rebuilt: true };
        }

        const hash = contentHash(normalized);
        const current = chunksRepository.indexState(material.id);
        if (
            current &&
            current.contentHash === hash &&
            current.chunkingVersion === CHUNKING_VERSION &&
            current.chunkCount > 0
        ) {
            return {
                materialId: material.id,
                chunkCount: current.chunkCount,
                rebuilt: false
            };
        }

        const chunks = documentChunker.chunk(normalized);
        chunksRepository.replaceForMaterial({
            materialId: material.id,
            courseId: material.courseId,
            chunks,
            contentHash: hash,
            chunkingVersion: CHUNKING_VERSION
        });
        return { materialId: material.id, chunkCount: chunks.length, rebuilt: true };
    }

    return {
        rebuildMaterial,
        rebuildStale() {
            return chunksRepository.listMaterialsForIndexing().map(rebuildMaterial);
        }
    };
}

module.exports = {
    CHUNKING_VERSION,
    contentHash,
    createMaterialIndexingService
};
