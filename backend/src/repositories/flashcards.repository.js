function createFlashcardsRepository(database) {
    const fields = `
        flashcards.id,
        flashcards.user_id AS userId,
        flashcards.course_id AS courseId,
        flashcards.front,
        flashcards.back,
        flashcards.mastery_level AS masteryLevel,
        flashcards.correct_count AS correctCount,
        flashcards.incorrect_count AS incorrectCount,
        flashcards.last_reviewed_at AS lastReviewedAt,
        flashcards.created_at AS createdAt,
        flashcards.updated_at AS updatedAt
    `;

    function materialIdsFor(flashcardId) {
        return database.prepare(`
            SELECT material_id AS materialId
            FROM flashcard_materials
            WHERE flashcard_id = ?
            ORDER BY material_id
        `).all(flashcardId).map(row => row.materialId);
    }

    function mapCard(row) {
        return {
            ...row,
            reviewCount: row.correctCount + row.incorrectCount,
            materialIds: materialIdsFor(row.id)
        };
    }

    function findOwned(flashcardId, courseId, userId) {
        const row = database.prepare(`
            SELECT ${fields}
            FROM flashcards
            WHERE id = ? AND course_id = ? AND user_id = ?
        `).get(flashcardId, courseId, userId);
        return row ? mapCard(row) : undefined;
    }

    const createBatchTransaction = database.transaction(input => {
        const insertCard = database.prepare(`
            INSERT INTO flashcards (user_id, course_id, front, back)
            VALUES (?, ?, ?, ?)
        `);
        const insertMaterial = database.prepare(`
            INSERT INTO flashcard_materials (flashcard_id, material_id)
            VALUES (?, ?)
        `);

        return input.cards.map(card => {
            const result = insertCard.run(
                input.userId,
                input.courseId,
                card.front,
                card.back
            );
            const flashcardId = Number(result.lastInsertRowid);
            input.materialIds.forEach(materialId => {
                insertMaterial.run(flashcardId, materialId);
            });
            return flashcardId;
        });
    });

    return {
        listOwned(courseId, userId, materialId = null) {
            const rows = database.prepare(`
                SELECT ${fields}
                FROM flashcards
                WHERE flashcards.course_id = ?
                  AND flashcards.user_id = ?
                  AND (
                    ? IS NULL OR EXISTS (
                        SELECT 1 FROM flashcard_materials
                        WHERE flashcard_id = flashcards.id
                          AND material_id = ?
                    )
                  )
                ORDER BY
                    CASE WHEN last_reviewed_at IS NULL THEN 0 ELSE 1 END,
                    mastery_level ASC,
                    last_reviewed_at ASC,
                    flashcards.id ASC
            `).all(courseId, userId, materialId, materialId);
            return rows.map(mapCard);
        },

        findOwned,

        createBatch(input) {
            return createBatchTransaction(input).map(id =>
                findOwned(id, input.courseId, input.userId)
            );
        },

        updateOwned(flashcardId, courseId, userId, changes) {
            database.prepare(`
                UPDATE flashcards
                SET front = COALESCE(?, front),
                    back = COALESCE(?, back),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND course_id = ? AND user_id = ?
            `).run(
                changes.front ?? null,
                changes.back ?? null,
                flashcardId,
                courseId,
                userId
            );
            return findOwned(flashcardId, courseId, userId);
        },

        reviewOwned(flashcardId, courseId, userId, outcome) {
            const knowIt = outcome === "know_it";
            database.prepare(`
                UPDATE flashcards
                SET correct_count = correct_count + ?,
                    incorrect_count = incorrect_count + ?,
                    mastery_level = CASE
                        WHEN ? = 1 THEN MIN(5, mastery_level + 1)
                        ELSE MAX(0, mastery_level - 1)
                    END,
                    last_reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND course_id = ? AND user_id = ?
            `).run(
                knowIt ? 1 : 0,
                knowIt ? 0 : 1,
                knowIt ? 1 : 0,
                flashcardId,
                courseId,
                userId
            );
            return findOwned(flashcardId, courseId, userId);
        },

        deleteOwned(flashcardId, courseId, userId) {
            return database.prepare(`
                DELETE FROM flashcards
                WHERE id = ? AND course_id = ? AND user_id = ?
            `).run(flashcardId, courseId, userId).changes > 0;
        }
    };
}

module.exports = { createFlashcardsRepository };
