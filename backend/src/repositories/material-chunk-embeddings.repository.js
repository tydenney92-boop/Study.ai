function parseVector(value) {
    const vector = JSON.parse(value);
    if (!Array.isArray(vector) || vector.length === 0 ||
        vector.some(item => !Number.isFinite(item))) {
        throw new Error("Stored embedding vector is invalid.");
    }
    return vector;
}

function createMaterialChunkEmbeddingsRepository(database) {
    const upsert = database.prepare(`
        INSERT INTO material_chunk_embeddings (
            chunk_id, provider, model, embedding_version, dimensions,
            vector_json, source_content_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chunk_id) DO UPDATE SET
            provider = excluded.provider,
            model = excluded.model,
            embedding_version = excluded.embedding_version,
            dimensions = excluded.dimensions,
            vector_json = excluded.vector_json,
            source_content_hash = excluded.source_content_hash,
            updated_at = CURRENT_TIMESTAMP
    `);
    const upsertMany = database.transaction(input => {
        input.items.forEach(item => upsert.run(
            item.chunkId,
            input.provider,
            input.model,
            input.embeddingVersion,
            item.vector.length,
            JSON.stringify(item.vector),
            item.contentHash
        ));
        return input.items.length;
    });

    return {
        upsertMany,

        listStale({ provider, model, embeddingVersion, limit, materialId }) {
            const materialFilter = materialId ? "AND material_chunks.material_id = ?" : "";
            const parameters = [provider, model, embeddingVersion];
            if (materialId) parameters.push(materialId);
            parameters.push(limit);
            return database.prepare(`
                SELECT material_chunks.id AS chunkId,
                       material_chunks.material_id AS materialId,
                       material_chunks.chunk_text AS text,
                       material_chunks.content_hash AS contentHash
                FROM material_chunks
                LEFT JOIN material_chunk_embeddings
                  ON material_chunk_embeddings.chunk_id = material_chunks.id
                WHERE (
                    material_chunk_embeddings.id IS NULL OR
                    material_chunk_embeddings.provider != ? OR
                    material_chunk_embeddings.model != ? OR
                    material_chunk_embeddings.embedding_version != ? OR
                    material_chunk_embeddings.source_content_hash != material_chunks.content_hash
                )
                ${materialFilter}
                ORDER BY material_chunks.material_id, material_chunks.chunk_index
                LIMIT ?
            `).all(...parameters);
        },

        listCandidates({ courseId, userId, materialIds, provider, model, embeddingVersion }) {
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
                           AS materialName,
                       material_chunk_embeddings.vector_json AS vectorJson
                FROM material_chunk_embeddings
                JOIN material_chunks
                  ON material_chunks.id = material_chunk_embeddings.chunk_id
                JOIN materials ON materials.id = material_chunks.material_id
                JOIN courses ON courses.id = material_chunks.course_id
                WHERE material_chunks.course_id = ?
                  AND courses.user_id = ?
                  AND material_chunks.material_id IN (${placeholders})
                  AND material_chunk_embeddings.provider = ?
                  AND material_chunk_embeddings.model = ?
                  AND material_chunk_embeddings.embedding_version = ?
                  AND material_chunk_embeddings.source_content_hash = material_chunks.content_hash
                ORDER BY material_chunks.material_id, material_chunks.chunk_index
            `).all(
                courseId,
                userId,
                ...materialIds,
                provider,
                model,
                embeddingVersion
            ).map(row => ({
                ...row,
                vector: parseVector(row.vectorJson),
                vectorJson: undefined
            }));
        },

        count() {
            return database.prepare(
                "SELECT COUNT(*) AS count FROM material_chunk_embeddings"
            ).get().count;
        }
    };
}

module.exports = { createMaterialChunkEmbeddingsRepository, parseVector };
