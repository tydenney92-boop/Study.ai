module.exports = {
    id: 8,
    name: "material-chunks",
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS material_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
                chunk_text TEXT NOT NULL CHECK (length(trim(chunk_text)) > 0),
                character_count INTEGER NOT NULL CHECK (character_count > 0),
                token_estimate INTEGER NOT NULL CHECK (token_estimate > 0),
                content_hash TEXT NOT NULL,
                chunking_version INTEGER NOT NULL CHECK (chunking_version > 0),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                UNIQUE (material_id, chunk_index)
            );

            CREATE INDEX IF NOT EXISTS material_chunks_material_order_idx
                ON material_chunks(material_id, chunk_index);
            CREATE INDEX IF NOT EXISTS material_chunks_course_material_idx
                ON material_chunks(course_id, material_id, chunk_index);

            CREATE TRIGGER IF NOT EXISTS material_chunks_course_insert
            BEFORE INSERT ON material_chunks
            WHEN NOT EXISTS (
                SELECT 1 FROM materials
                WHERE id = NEW.material_id AND course_id = NEW.course_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'Material chunk must belong to its course');
            END;

            CREATE TRIGGER IF NOT EXISTS material_chunks_course_update
            BEFORE UPDATE OF material_id, course_id ON material_chunks
            WHEN NOT EXISTS (
                SELECT 1 FROM materials
                WHERE id = NEW.material_id AND course_id = NEW.course_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'Material chunk must belong to its course');
            END;
        `);
    }
};
