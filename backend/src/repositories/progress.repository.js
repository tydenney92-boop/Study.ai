function createProgressRepository(database) {
    function whereCourse(courseId) {
        return courseId === null ? "" : "AND courses.id = ?";
    }

    return {
        summary(userId, courseId = null) {
            const parameters = courseId === null ? [userId] : [userId, courseId];
            const aggregate = database.prepare(`
                SELECT
                    COUNT(attempts.id) AS totalAttempts,
                    ROUND(AVG(attempts.score), 1) AS averageScore
                FROM quiz_attempts AS attempts
                JOIN generated_quizzes AS quizzes ON quizzes.id = attempts.quiz_id
                JOIN courses ON courses.id = quizzes.course_id
                WHERE attempts.user_id = ? ${whereCourse(courseId)}
            `).get(...parameters);

            const activity = database.prepare(`
                SELECT
                    attempts.id AS attemptId,
                    attempts.quiz_id AS quizId,
                    attempts.score,
                    attempts.created_at AS createdAt,
                    courses.id AS courseId,
                    courses.course_code AS courseCode,
                    courses.course_name AS courseName,
                    json_array_length(json_extract(
                        quizzes.generated_quiz_json, '$.questions'
                    )) AS questionCount
                FROM quiz_attempts AS attempts
                JOIN generated_quizzes AS quizzes ON quizzes.id = attempts.quiz_id
                JOIN courses ON courses.id = quizzes.course_id
                WHERE attempts.user_id = ? ${whereCourse(courseId)}
                ORDER BY attempts.created_at DESC, attempts.id DESC
                LIMIT 10
            `).all(...parameters);

            const courses = database.prepare(`
                SELECT
                    courses.id AS courseId,
                    courses.course_code AS courseCode,
                    courses.course_name AS courseName,
                    COUNT(attempts.id) AS attemptCount,
                    ROUND(AVG(attempts.score), 1) AS averageScore
                FROM courses
                LEFT JOIN generated_quizzes AS quizzes
                    ON quizzes.course_id = courses.id
                LEFT JOIN quiz_attempts AS attempts
                    ON attempts.quiz_id = quizzes.id
                    AND attempts.user_id = courses.user_id
                WHERE courses.user_id = ? ${whereCourse(courseId)}
                GROUP BY courses.id
                ORDER BY attemptCount DESC, courses.created_at DESC, courses.id DESC
            `).all(...parameters);

            return {
                totalAttempts: aggregate.totalAttempts,
                averageScore: aggregate.averageScore,
                recentActivity: activity,
                courses
            };
        }
    };
}

module.exports = { createProgressRepository };
