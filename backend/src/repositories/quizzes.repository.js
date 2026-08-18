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

        for (const materialId of input.materialIds) {
            insertContext.run(quizId, materialId);
        }

        return quizId;
    });

    return {
        createWithMaterials(input) {
            const quizId = insertWithMaterials(input);
            return this.findOwned(quizId, input.userId);
        },

        findOwned(quizId, userId) {
            const row = database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    course_id AS courseId,
                    generated_quiz_json AS quizJson,
                    created_at AS createdAt
                FROM generated_quizzes
                WHERE id = ? AND user_id = ?
            `).get(quizId, userId);

            if (!row) {
                return undefined;
            }

            const quiz = JSON.parse(row.quizJson);
            const materialIds = database.prepare(`
                SELECT material_id AS materialId
                FROM quiz_materials
                WHERE quiz_id = ?
                ORDER BY material_id
            `).all(quizId).map(context => context.materialId);

            return {
                id: row.id,
                userId: row.userId,
                courseId: row.courseId,
                quiz,
                materialIds,
                createdAt: row.createdAt
            };
        }
    };
}

module.exports = {
    createQuizzesRepository
};
