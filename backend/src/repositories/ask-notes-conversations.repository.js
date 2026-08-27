function createAskNotesConversationsRepository(database) {
    const insertMessage = database.prepare(`
        INSERT INTO ask_notes_messages (
            conversation_id, role, content, support_type
        ) VALUES (?, ?, ?, ?)
    `);
    const insertMaterial = database.prepare(`
        INSERT INTO ask_notes_message_materials (
            message_id, relationship, source_order, material_id, material_name
        ) VALUES (?, ?, ?, ?, ?)
    `);

    function mapConversation(row) {
        return row ? {
            id: row.id,
            userId: row.userId,
            courseId: row.courseId,
            preview: row.preview || "New conversation",
            messageCount: row.messageCount || 0,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        } : undefined;
    }

    function materialsForMessages(messageIds) {
        if (messageIds.length === 0) return new Map();
        const placeholders = messageIds.map(() => "?").join(",");
        const grouped = new Map();
        database.prepare(`
            SELECT message_id AS messageId, relationship, source_order AS sourceOrder,
                   material_id AS materialId, material_name AS name
            FROM ask_notes_message_materials
            WHERE message_id IN (${placeholders})
            ORDER BY message_id, relationship, source_order
        `).all(...messageIds).forEach(row => {
            if (!grouped.has(row.messageId)) grouped.set(row.messageId, []);
            grouped.get(row.messageId).push(row);
        });
        return grouped;
    }

    function listMessages(conversationId, limit) {
        const rows = database.prepare(`
            SELECT * FROM (
                SELECT id, conversation_id AS conversationId, role, content,
                       support_type AS supportType, created_at AS createdAt
                FROM ask_notes_messages
                WHERE conversation_id = ?
                ORDER BY id DESC
                LIMIT ?
            ) ORDER BY id
        `).all(conversationId, limit);
        const materials = materialsForMessages(rows.map(row => row.id));
        return rows.map(row => {
            const related = materials.get(row.id) || [];
            return {
                ...row,
                materialIds: related
                    .filter(item => item.relationship === "selection" && item.materialId !== null)
                    .map(item => item.materialId),
                sources: related
                    .filter(item => item.relationship === "source")
                    .map(item => ({ materialId: item.materialId, name: item.name }))
            };
        });
    }

    const appendTransaction = database.transaction(input => {
        let conversationId = input.conversationId;
        if (!conversationId) {
            conversationId = Number(database.prepare(`
                INSERT INTO ask_notes_conversations (user_id, course_id)
                VALUES (?, ?)
            `).run(input.userId, input.courseId).lastInsertRowid);
        }
        const userMessageId = Number(insertMessage.run(
            conversationId, "user", input.question, null
        ).lastInsertRowid);
        input.selectedMaterials.forEach((material, index) => insertMaterial.run(
            userMessageId, "selection", index, material.id, material.name
        ));
        const assistantMessageId = Number(insertMessage.run(
            conversationId, "assistant", input.answer, input.supportType
        ).lastInsertRowid);
        input.sources.forEach((source, index) => insertMaterial.run(
            assistantMessageId, "source", index, source.materialId, source.name
        ));
        database.prepare(`
            UPDATE ask_notes_conversations
            SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
            WHERE id = ?
        `).run(conversationId);
        return { conversationId, userMessageId, assistantMessageId };
    });

    return {
        create(courseId, userId) {
            const id = Number(database.prepare(`
                INSERT INTO ask_notes_conversations (user_id, course_id)
                VALUES (?, ?)
            `).run(userId, courseId).lastInsertRowid);
            return this.findOwned(id, courseId, userId);
        },

        findOwned(conversationId, courseId, userId) {
            return mapConversation(database.prepare(`
                SELECT conversations.id,
                       conversations.user_id AS userId,
                       conversations.course_id AS courseId,
                       conversations.created_at AS createdAt,
                       conversations.updated_at AS updatedAt,
                       COUNT(messages.id) AS messageCount,
                       COALESCE((
                           SELECT content FROM ask_notes_messages
                           WHERE conversation_id = conversations.id AND role = 'user'
                           ORDER BY id LIMIT 1
                       ), 'New conversation') AS preview
                FROM ask_notes_conversations AS conversations
                LEFT JOIN ask_notes_messages AS messages
                    ON messages.conversation_id = conversations.id
                WHERE conversations.id = ?
                  AND conversations.course_id = ?
                  AND conversations.user_id = ?
                GROUP BY conversations.id
            `).get(conversationId, courseId, userId));
        },

        listOwned(courseId, userId, limit) {
            return database.prepare(`
                SELECT conversations.id,
                       conversations.user_id AS userId,
                       conversations.course_id AS courseId,
                       conversations.created_at AS createdAt,
                       conversations.updated_at AS updatedAt,
                       COUNT(messages.id) AS messageCount,
                       COALESCE((
                           SELECT content FROM ask_notes_messages
                           WHERE conversation_id = conversations.id AND role = 'user'
                           ORDER BY id LIMIT 1
                       ), 'New conversation') AS preview
                FROM ask_notes_conversations AS conversations
                LEFT JOIN ask_notes_messages AS messages
                    ON messages.conversation_id = conversations.id
                WHERE conversations.course_id = ? AND conversations.user_id = ?
                GROUP BY conversations.id
                ORDER BY conversations.updated_at DESC, conversations.id DESC
                LIMIT ?
            `).all(courseId, userId, limit).map(mapConversation);
        },

        messages(conversationId, limit) {
            return listMessages(conversationId, limit);
        },

        appendTurn(input) {
            return appendTransaction(input);
        }
    };
}

module.exports = { createAskNotesConversationsRepository };
