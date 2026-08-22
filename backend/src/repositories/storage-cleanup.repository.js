function createStorageCleanupRepository(database) {
    const enqueue = database.prepare(`
        INSERT OR IGNORE INTO storage_cleanup_jobs (user_id, stored_filename)
        VALUES (?, ?)
    `);

    function jobsFor(userId, filenames) {
        if (!filenames.length) return [];
        const placeholders = filenames.map(() => "?").join(",");
        return database.prepare(`
            SELECT id, user_id AS userId, stored_filename AS storedFilename,
                   attempt_count AS attemptCount, last_error AS lastError
            FROM storage_cleanup_jobs
            WHERE user_id = ? AND stored_filename IN (${placeholders})
            ORDER BY id
        `).all(userId, ...filenames);
    }

    const deleteMaterial = database.transaction(({ materialId, courseId, userId, storedFilename }) => {
        enqueue.run(userId, storedFilename);
        database.prepare(`
            DELETE FROM materials
            WHERE id = ? AND course_id = ?
              AND EXISTS (SELECT 1 FROM courses WHERE id = ? AND user_id = ?)
        `).run(materialId, courseId, courseId, userId);
        return jobsFor(userId, [storedFilename]);
    });

    const deleteCourse = database.transaction(({ courseId, userId, filenames }) => {
        filenames.forEach(filename => enqueue.run(userId, filename));
        database.prepare("DELETE FROM courses WHERE id = ? AND user_id = ?")
            .run(courseId, userId);
        return jobsFor(userId, filenames);
    });

    return {
        deleteMaterialWithCleanup: deleteMaterial,
        deleteCourseWithCleanup: deleteCourse,
        listPending(userId) {
            return database.prepare(`
                SELECT id, user_id AS userId, stored_filename AS storedFilename,
                       attempt_count AS attemptCount, last_error AS lastError
                FROM storage_cleanup_jobs WHERE user_id = ? ORDER BY id
            `).all(userId);
        },
        complete(id, userId) {
            database.prepare("DELETE FROM storage_cleanup_jobs WHERE id = ? AND user_id = ?")
                .run(id, userId);
        },
        fail(id, userId, error) {
            database.prepare(`
                UPDATE storage_cleanup_jobs
                SET attempt_count = attempt_count + 1,
                    last_error = ?, last_attempt_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(String(error?.message || error).slice(0, 500), id, userId);
        }
    };
}

module.exports = { createStorageCleanupRepository };
