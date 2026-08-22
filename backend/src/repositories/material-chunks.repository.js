function createMaterialChunksRepository(database) {
    const insertChunk = database.prepare(`
        INSERT INTO material_chunks (
            material_id, course_id, chunk_index, chunk_text,
            character_count, token_estimate, content_hash, chunking_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const replaceForMaterial = database.transaction(input => {
        database.prepare("DELETE FROM material_chunks WHERE material_id = ?")
            .run(input.materialId);
        input.chunks.forEach(chunk => insertChunk.run(
            input.materialId,
            input.courseId,
            chunk.chunkIndex,
            chunk.text,
            chunk.characterCount,
            chunk.tokenEstimate,
            input.contentHash,
            input.chunkingVersion
        ));
        return input.chunks.length;
    });

    return {
        replaceForMaterial,

        indexState(materialId) {
            return database.prepare(`
                SELECT content_hash AS contentHash,
                       chunking_version AS chunkingVersion,
                       COUNT(*) AS chunkCount
                FROM material_chunks
                WHERE material_id = ?
                GROUP BY content_hash, chunking_version
                ORDER BY chunking_version DESC
                LIMIT 1
            `).get(materialId);
        },

        listMaterialsForIndexing() {
            return database.prepare(`
                SELECT id, course_id AS courseId,
                       extracted_text AS extractedText,
                       extraction_status AS extractionStatus
                FROM materials
                ORDER BY id
            `).all();
        },

        listForMaterial(materialId) {
            return database.prepare(`
                SELECT id AS chunkId, material_id AS materialId,
                       course_id AS courseId, chunk_index AS chunkIndex,
                       chunk_text AS text, character_count AS characterCount,
                       token_estimate AS tokenEstimate,
                       content_hash AS contentHash,
                       chunking_version AS chunkingVersion
                FROM material_chunks
                WHERE material_id = ?
                ORDER BY chunk_index
            `).all(materialId);
        },

        listCandidates({ courseId, userId, materialIds }) {
            if (materialIds.length === 0) return [];
            const placeholders = materialIds.map(() => "?").join(",");
            return database.prepare(`
                SELECT material_chunks.id AS chunkId,
                       material_chunks.material_id AS materialId,
                       material_chunks.course_id AS courseId,
                       material_chunks.chunk_index AS chunkIndex,
                       material_chunks.chunk_text AS text,
                       material_chunks.character_count AS characterCount,
                       material_chunks.token_estimate AS tokenEstimate,
                       COALESCE(materials.display_name, materials.original_filename)
                           AS materialName
                FROM material_chunks
                JOIN materials ON materials.id = material_chunks.material_id
                JOIN courses ON courses.id = material_chunks.course_id
                WHERE material_chunks.course_id = ?
                  AND courses.user_id = ?
                  AND material_chunks.material_id IN (${placeholders})
                ORDER BY material_chunks.material_id, material_chunks.chunk_index
            `).all(courseId, userId, ...materialIds);
        }
    };
}

module.exports = { createMaterialChunksRepository };
