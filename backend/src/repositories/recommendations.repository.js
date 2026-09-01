function parseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
}

function ids(value) {
    return value ? value.split(",").map(Number) : [];
}

function createRecommendationsRepository(database) {
    return {
        quizAttempts(courseId, userId) {
            return database.prepare(`
                SELECT attempts.id AS attemptId,
                       attempts.quiz_id AS quizId,
                       attempts.score,
                       attempts.answers_json AS answersJson,
                       attempts.results_json AS resultsJson,
                       attempts.created_at AS createdAt,
                       quizzes.generated_quiz_json AS quizJson,
                       GROUP_CONCAT(DISTINCT quiz_materials.material_id) AS materialIds
                FROM quiz_attempts AS attempts
                JOIN generated_quizzes AS quizzes ON quizzes.id = attempts.quiz_id
                LEFT JOIN quiz_materials ON quiz_materials.quiz_id = quizzes.id
                WHERE quizzes.course_id = ?
                  AND quizzes.user_id = ?
                  AND attempts.user_id = ?
                GROUP BY attempts.id
                ORDER BY attempts.created_at DESC, attempts.id DESC
            `).all(courseId, userId, userId).map(row => ({
                ...row,
                answers: parseJson(row.answersJson, []),
                results: parseJson(row.resultsJson, null),
                quiz: parseJson(row.quizJson, { questions: [] }),
                materialIds: ids(row.materialIds)
            }));
        },

        flashcards(courseId, userId) {
            return database.prepare(`
                SELECT flashcards.id, flashcards.front, flashcards.back,
                       flashcards.mastery_level AS masteryLevel,
                       flashcards.correct_count AS correctCount,
                       flashcards.incorrect_count AS incorrectCount,
                       flashcards.last_reviewed_at AS lastReviewedAt,
                       GROUP_CONCAT(DISTINCT flashcard_materials.material_id) AS materialIds
                FROM flashcards
                LEFT JOIN flashcard_materials
                    ON flashcard_materials.flashcard_id = flashcards.id
                WHERE flashcards.course_id = ? AND flashcards.user_id = ?
                GROUP BY flashcards.id
                ORDER BY flashcards.id
            `).all(courseId, userId).map(row => ({
                ...row,
                reviewCount: row.correctCount + row.incorrectCount,
                materialIds: ids(row.materialIds)
            }));
        },

        extractedMaterials(courseId, userId) {
            return database.prepare(`
                SELECT materials.id,
                       COALESCE(materials.display_name, materials.original_filename) AS name,
                       materials.extracted_text AS extractedText,
                       materials.material_role AS materialRole,
                       materials.unit_id AS unitId,
                       units.name AS unitName
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                LEFT JOIN units ON units.id = materials.unit_id
                WHERE materials.course_id = ? AND courses.user_id = ?
                  AND materials.extraction_status = 'extracted'
                ORDER BY materials.id
            `).all(courseId, userId);
        },

        studyGuides(courseId, userId) {
            return database.prepare(`
                SELECT guides.id, guides.created_at AS createdAt,
                       GROUP_CONCAT(DISTINCT sources.material_id) AS materialIds
                FROM generated_study_guides AS guides
                LEFT JOIN study_guide_sources AS sources
                    ON sources.study_guide_id = guides.id
                WHERE guides.course_id = ? AND guides.user_id = ?
                GROUP BY guides.id
                ORDER BY guides.created_at DESC, guides.id DESC
            `).all(courseId, userId).map(row => ({
                ...row,
                materialIds: ids(row.materialIds)
            }));
        }
    };
}

module.exports = { createRecommendationsRepository };
