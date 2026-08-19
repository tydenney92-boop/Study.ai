function createQuizzesRepository(database) {
    const insertWithMaterials = database.transaction(input => {
        const result = database.prepare(`
            INSERT INTO generated_quizzes (
                user_id, course_id, generated_quiz_json
            ) VALUES (?, ?, ?)
        `).run(input.userId, input.courseId, JSON.stringify(input.quiz));
        const quizId = Number(result.lastInsertRowid);
        const insertContext = database.prepare(`
            INSERT INTO quiz_materials (quiz_id, material_id)
            VALUES (?, ?)
        `);
        const insertSource = database.prepare(`
            INSERT INTO quiz_sources (
                quiz_id, source_order, material_id, material_name
            ) VALUES (?, ?, ?, ?)
        `);

        input.sources.forEach((source, index) => {
            insertContext.run(quizId, source.materialId);
            insertSource.run(quizId, index, source.materialId, source.materialName);
        });
        return quizId;
    });

    function sourcesFor(quizId) {
        const sources = database.prepare(`
            SELECT material_id AS materialId, material_name AS materialName
            FROM quiz_sources
            WHERE quiz_id = ?
            ORDER BY source_order
        `).all(quizId);
        return sources.length > 0
            ? sources
            : [{ materialId: null, materialName: "Source material unavailable" }];
    }

    function mapQuiz(row, includeQuiz = true) {
        const sources = sourcesFor(row.id);
        const mapped = {
            id: row.id,
            userId: row.userId,
            courseId: row.courseId,
            materialIds: sources.map(source => source.materialId)
                .filter(id => id !== null)
                .sort((a, b) => a - b),
            sources,
            attemptCount: row.attemptCount || 0,
            createdAt: row.createdAt
        };
        if (includeQuiz) mapped.quiz = JSON.parse(row.quizJson);
        return mapped;
    }

    return {
        createWithMaterials(input) {
            const quizId = insertWithMaterials(input);
            return this.findOwned(quizId, input.userId);
        },

        findOwned(quizId, userId, courseId = null) {
            const row = database.prepare(`
                SELECT
                    quizzes.id,
                    quizzes.user_id AS userId,
                    quizzes.course_id AS courseId,
                    quizzes.generated_quiz_json AS quizJson,
                    quizzes.created_at AS createdAt,
                    COUNT(attempts.id) AS attemptCount
                FROM generated_quizzes AS quizzes
                LEFT JOIN quiz_attempts AS attempts ON attempts.quiz_id = quizzes.id
                WHERE quizzes.id = ? AND quizzes.user_id = ?
                  AND (? IS NULL OR quizzes.course_id = ?)
                GROUP BY quizzes.id
            `).get(quizId, userId, courseId, courseId);
            return row ? mapQuiz(row) : undefined;
        },

        listOwned(courseId, userId) {
            return database.prepare(`
                SELECT
                    quizzes.id,
                    quizzes.user_id AS userId,
                    quizzes.course_id AS courseId,
                    quizzes.created_at AS createdAt,
                    COUNT(attempts.id) AS attemptCount
                FROM generated_quizzes AS quizzes
                LEFT JOIN quiz_attempts AS attempts ON attempts.quiz_id = quizzes.id
                WHERE quizzes.course_id = ? AND quizzes.user_id = ?
                GROUP BY quizzes.id
                ORDER BY quizzes.created_at DESC, quizzes.id DESC
            `).all(courseId, userId).map(row => mapQuiz(row, false));
        },

        deleteOwned(quizId, courseId, userId) {
            const remove = database.transaction(() => database.prepare(`
                DELETE FROM generated_quizzes
                WHERE id = ? AND course_id = ? AND user_id = ?
            `).run(quizId, courseId, userId).changes > 0);
            return remove();
        }
    };
}

module.exports = { createQuizzesRepository };
