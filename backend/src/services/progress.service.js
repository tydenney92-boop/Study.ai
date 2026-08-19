function createProgressService({ coursesService, progressRepository }) {
    function build(userId, courseId = null) {
        if (courseId !== null) coursesService.requireOwned(courseId, userId);
        const progress = progressRepository.summary(userId, courseId);
        return {
            totalAttempts: progress.totalAttempts,
            averageScore: progress.averageScore,
            recentScores: progress.recentActivity.map(item => ({
                attemptId: item.attemptId,
                quizId: item.quizId,
                courseId: item.courseId,
                courseCode: item.courseCode,
                score: item.score,
                createdAt: item.createdAt
            })),
            scoreTrend: [...progress.recentActivity].reverse().map(item => ({
                attemptId: item.attemptId,
                score: item.score,
                createdAt: item.createdAt
            })),
            courses: progress.courses,
            recentActivity: progress.recentActivity
        };
    }

    return {
        overall(userId) {
            return build(userId);
        },
        course(courseId, userId) {
            return build(userId, courseId);
        }
    };
}

module.exports = { createProgressService };
