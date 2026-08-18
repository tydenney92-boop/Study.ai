function createCoursesRepository(database) {
    const selectFields = `
        id,
        user_id AS userId,
        course_name AS courseName,
        course_code AS courseCode,
        semester,
        created_at AS createdAt
    `;

    return {
        listByUser(userId) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM courses
                WHERE user_id = ?
                ORDER BY created_at, id
            `).all(userId);
        },

        findOwned(courseId, userId) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM courses
                WHERE id = ? AND user_id = ?
            `).get(courseId, userId);
        },

        findLegacyOwned(userId) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM courses
                WHERE user_id = ?
                  AND course_code = 'ECON 110'
                  AND semester = 'Legacy Prototype'
            `).get(userId);
        },

        create({ userId, courseName, courseCode, semester }) {
            const result = database.prepare(`
                INSERT INTO courses (
                    user_id, course_name, course_code, semester
                ) VALUES (?, ?, ?, ?)
            `).run(userId, courseName, courseCode, semester);

            return this.findOwned(Number(result.lastInsertRowid), userId);
        },

        updateOwned(courseId, userId, changes) {
            const current = this.findOwned(courseId, userId);

            if (!current) {
                return undefined;
            }

            database.prepare(`
                UPDATE courses
                SET course_name = ?, course_code = ?, semester = ?
                WHERE id = ? AND user_id = ?
            `).run(
                changes.courseName ?? current.courseName,
                changes.courseCode ?? current.courseCode,
                changes.semester ?? current.semester,
                courseId,
                userId
            );

            return this.findOwned(courseId, userId);
        },

        countMaterialsOwned(courseId, userId) {
            return database.prepare(`
                SELECT COUNT(*) AS count
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                WHERE materials.course_id = ? AND courses.user_id = ?
            `).get(courseId, userId).count;
        },

        deleteOwned(courseId, userId) {
            return database.prepare(`
                DELETE FROM courses
                WHERE id = ? AND user_id = ?
            `).run(courseId, userId).changes > 0;
        }
    };
}

module.exports = {
    createCoursesRepository
};
