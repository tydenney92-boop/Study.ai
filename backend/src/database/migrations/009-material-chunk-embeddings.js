module.exports = {
    id: 9,
    name: "material-chunk-embeddings",
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS material_chunk_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chunk_id INTEGER NOT NULL UNIQUE,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                embedding_version INTEGER NOT NULL CHECK (embedding_version > 0),
                dimensions INTEGER NOT NULL CHECK (dimensions > 0),
                vector_json TEXT NOT NULL CHECK (json_valid(vector_json)),
                source_content_hash TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chunk_id) REFERENCES material_chunks(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS material_chunk_embeddings_configuration_idx
                ON material_chunk_embeddings(provider, model, embedding_version);
            CREATE INDEX IF NOT EXISTS material_chunk_embeddings_source_hash_idx
                ON material_chunk_embeddings(source_content_hash);
        `);
    }
};
