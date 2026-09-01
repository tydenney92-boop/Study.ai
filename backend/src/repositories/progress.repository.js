function ids(value) {
    return value ? value.split(",").map(Number).filter(Number.isInteger) : [];
}

function json(value, fallback) {
    try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function createProgressRepository(database) {
    const courseFilter = courseId => courseId === null ? "" : "AND courses.id = ?";
    const values = (userId, courseId) => courseId === null ? [userId] : [userId, courseId];

    return {
        snapshot(userId, courseId = null) {
            const parameters = values(userId, courseId);
            const courses = database.prepare(`
                SELECT courses.id AS courseId, courses.course_code AS courseCode,
                       courses.course_name AS courseName, courses.semester,
                       courses.created_at AS createdAt
                FROM courses WHERE courses.user_id = ? ${courseFilter(courseId)}
                ORDER BY COALESCE(courses.last_opened_at, courses.created_at) DESC,
                         courses.id DESC
            `).all(...parameters);
            const units = database.prepare(`
                SELECT units.id, units.course_id AS courseId, units.name,
                       units.unit_number AS unitNumber
                FROM units JOIN courses ON courses.id = units.course_id
                WHERE courses.user_id = ? ${courseFilter(courseId)}
                ORDER BY units.course_id, units.unit_number, units.id
            `).all(...parameters);
            const materials = database.prepare(`
                SELECT materials.id, materials.course_id AS courseId,
                       materials.unit_id AS unitId,
                       COALESCE(materials.display_name, materials.original_filename) AS name,
                       materials.extraction_status AS extractionStatus,
                       materials.material_role AS materialRole,
                       (SELECT COUNT(DISTINCT qm.quiz_id) FROM quiz_materials qm
                        WHERE qm.material_id = materials.id) AS quizCount,
                       (SELECT COUNT(DISTINCT qa.id) FROM quiz_materials qm
                        JOIN quiz_attempts qa ON qa.quiz_id = qm.quiz_id
                        WHERE qm.material_id = materials.id AND qa.user_id = courses.user_id)
                            AS quizAttemptCount,
                       (SELECT ROUND(AVG(qa.score), 1) FROM quiz_materials qm
                        JOIN quiz_attempts qa ON qa.quiz_id = qm.quiz_id
                        WHERE qm.material_id = materials.id AND qa.user_id = courses.user_id)
                            AS quizAverage,
                       (SELECT COUNT(DISTINCT fm.flashcard_id) FROM flashcard_materials fm
                        WHERE fm.material_id = materials.id) AS flashcardCount,
                       (SELECT COALESCE(SUM(f.correct_count + f.incorrect_count), 0)
                        FROM flashcard_materials fm JOIN flashcards f ON f.id = fm.flashcard_id
                        WHERE fm.material_id = materials.id AND f.user_id = courses.user_id)
                            AS flashcardReviews,
                       (SELECT COUNT(*) FROM flashcard_materials fm
                        JOIN flashcards f ON f.id = fm.flashcard_id
                        WHERE fm.material_id = materials.id AND f.user_id = courses.user_id
                          AND (f.correct_count + f.incorrect_count) > 0 AND f.mastery_level <= 2)
                            AS lowMasteryCards,
                       (SELECT COUNT(DISTINCT sgm.study_guide_id) FROM study_guide_materials sgm
                        WHERE sgm.material_id = materials.id) AS studyGuideCount,
                       (SELECT COUNT(DISTINCT amm.message_id)
                        FROM ask_notes_message_materials amm
                        JOIN ask_notes_messages am ON am.id = amm.message_id
                        JOIN ask_notes_conversations ac ON ac.id = am.conversation_id
                        WHERE amm.material_id = materials.id AND ac.user_id = courses.user_id)
                            AS askNotesCount
                FROM materials JOIN courses ON courses.id = materials.course_id
                WHERE courses.user_id = ? ${courseFilter(courseId)}
                ORDER BY materials.course_id, materials.created_at, materials.id
            `).all(...parameters);
            const attempts = database.prepare(`
                SELECT attempts.id AS attemptId, attempts.quiz_id AS quizId,
                       attempts.score, attempts.answers_json AS answersJson,
                       attempts.results_json AS resultsJson,
                       attempts.created_at AS createdAt,
                       quizzes.course_id AS courseId,
                       quizzes.generated_quiz_json AS quizJson,
                       GROUP_CONCAT(DISTINCT quiz_materials.material_id) AS materialIds
                FROM quiz_attempts attempts
                JOIN generated_quizzes quizzes ON quizzes.id = attempts.quiz_id
                JOIN courses ON courses.id = quizzes.course_id
                LEFT JOIN quiz_materials ON quiz_materials.quiz_id = quizzes.id
                WHERE attempts.user_id = ? ${courseFilter(courseId)}
                GROUP BY attempts.id
                ORDER BY attempts.created_at DESC, attempts.id DESC
            `).all(...parameters).map(row => ({
                ...row, materialIds: ids(row.materialIds),
                answers: json(row.answersJson, []), results: json(row.resultsJson, null),
                quiz: json(row.quizJson, { questions: [] })
            }));
            const flashcards = database.prepare(`
                SELECT flashcards.id, flashcards.course_id AS courseId,
                       flashcards.front, flashcards.mastery_level AS masteryLevel,
                       flashcards.correct_count AS correctCount,
                       flashcards.incorrect_count AS incorrectCount,
                       flashcards.last_reviewed_at AS lastReviewedAt,
                       flashcards.created_at AS createdAt,
                       GROUP_CONCAT(DISTINCT flashcard_materials.material_id) AS materialIds
                FROM flashcards JOIN courses ON courses.id = flashcards.course_id
                LEFT JOIN flashcard_materials ON flashcard_materials.flashcard_id = flashcards.id
                WHERE flashcards.user_id = ? ${courseFilter(courseId)}
                GROUP BY flashcards.id
            `).all(...parameters).map(row => ({ ...row, materialIds: ids(row.materialIds) }));
            const guides = database.prepare(`
                SELECT guides.id, guides.course_id AS courseId, guides.created_at AS createdAt,
                       GROUP_CONCAT(DISTINCT sources.material_id) AS materialIds
                FROM generated_study_guides guides
                JOIN courses ON courses.id = guides.course_id
                LEFT JOIN study_guide_sources sources ON sources.study_guide_id = guides.id
                WHERE guides.user_id = ? ${courseFilter(courseId)}
                GROUP BY guides.id
            `).all(...parameters).map(row => ({ ...row, materialIds: ids(row.materialIds) }));
            const conversations = database.prepare(`
                SELECT conversations.id, conversations.course_id AS courseId,
                       conversations.updated_at AS updatedAt,
                       GROUP_CONCAT(DISTINCT related.material_id) AS materialIds
                FROM ask_notes_conversations conversations
                JOIN courses ON courses.id = conversations.course_id
                LEFT JOIN ask_notes_messages messages ON messages.conversation_id = conversations.id
                LEFT JOIN ask_notes_message_materials related ON related.message_id = messages.id
                WHERE conversations.user_id = ? ${courseFilter(courseId)}
                GROUP BY conversations.id
            `).all(...parameters).map(row => ({ ...row, materialIds: ids(row.materialIds) }));
            return { courses, units, materials, attempts, flashcards, guides, conversations };
        }
    };
}

module.exports = { createProgressRepository };
