function createQuizAttemptsRepository(database) {
    return {
        create(input) {
            const result = database.prepare(`
                INSERT INTO quiz_attempts (
                    user_id, quiz_id, score, answers_json, results_json
                ) VALUES (?, ?, ?, ?, ?)
            `).run(
                input.userId,
                input.quizId,
                input.score,
                JSON.stringify(input.answers),
                input.results === undefined || input.results === null
                    ? null
                    : JSON.stringify(input.results)
            );

            return this.findOwned(
                Number(result.lastInsertRowid),
                input.userId
            );
        },

        findOwned(attemptId, userId) {
            const row = database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    quiz_id AS quizId,
                    score,
                    answers_json AS answersJson,
                    results_json AS resultsJson,
                    created_at AS createdAt
                FROM quiz_attempts
                WHERE id = ? AND user_id = ?
            `).get(attemptId, userId);

            return row ? mapAttempt(row) : undefined;
        },

        listOwned(quizId, userId) {
            return database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    quiz_id AS quizId,
                    score,
                    answers_json AS answersJson,
                    results_json AS resultsJson,
                    created_at AS createdAt
                FROM quiz_attempts
                WHERE quiz_id = ? AND user_id = ?
                ORDER BY created_at, id
            `).all(quizId, userId).map(mapAttempt);
        }
    };
}

function mapAttempt(row) {
    return {
        id: row.id,
        userId: row.userId,
        quizId: row.quizId,
        score: row.score,
        answers: JSON.parse(row.answersJson),
        results: row.resultsJson ? JSON.parse(row.resultsJson) : null,
        createdAt: row.createdAt
    };
}

module.exports = {
    createQuizAttemptsRepository
};
