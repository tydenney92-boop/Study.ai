module.exports = {
    id: 10,
    name: "ask-notes-conversations",
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS ask_notes_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id, user_id)
                    REFERENCES courses(id, user_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ask_notes_conversations_owner_recent_idx
                ON ask_notes_conversations(user_id, course_id, updated_at DESC, id DESC);

            CREATE TABLE IF NOT EXISTS ask_notes_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL CHECK (length(trim(content)) > 0),
                support_type TEXT CHECK (
                    support_type IS NULL OR support_type IN (
                        'grounded', 'grounded_with_explanation', 'not_found'
                    )
                ),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id)
                    REFERENCES ask_notes_conversations(id) ON DELETE CASCADE,
                CHECK (
                    (role = 'user' AND support_type IS NULL) OR
                    (role = 'assistant' AND support_type IS NOT NULL)
                )
            );

            CREATE INDEX IF NOT EXISTS ask_notes_messages_conversation_order_idx
                ON ask_notes_messages(conversation_id, id);

            CREATE TABLE IF NOT EXISTS ask_notes_message_materials (
                message_id INTEGER NOT NULL,
                relationship TEXT NOT NULL
                    CHECK (relationship IN ('selection', 'source')),
                source_order INTEGER NOT NULL CHECK (source_order >= 0),
                material_id INTEGER,
                material_name TEXT NOT NULL,
                PRIMARY KEY (message_id, relationship, source_order),
                FOREIGN KEY (message_id)
                    REFERENCES ask_notes_messages(id) ON DELETE CASCADE,
                FOREIGN KEY (material_id)
                    REFERENCES materials(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS ask_notes_message_materials_material_idx
                ON ask_notes_message_materials(material_id);

            CREATE TRIGGER IF NOT EXISTS ask_notes_message_material_course_insert
            BEFORE INSERT ON ask_notes_message_materials
            WHEN NEW.material_id IS NOT NULL AND NOT EXISTS (
                SELECT 1
                FROM ask_notes_messages AS messages
                JOIN ask_notes_conversations AS conversations
                    ON conversations.id = messages.conversation_id
                JOIN materials ON materials.id = NEW.material_id
                WHERE messages.id = NEW.message_id
                  AND materials.course_id = conversations.course_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'Ask Notes material must belong to its conversation course');
            END;
        `);
    }
};
