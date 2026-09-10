const SELECT = `
    tasks.id, tasks.course_id AS courseId, tasks.title, tasks.type,
    tasks.description, tasks.due_at AS dueAt, tasks.start_at AS startAt,
    tasks.completed_at AS completedAt, tasks.priority,
    tasks.unit_id AS unitId, tasks.material_id AS materialId,
    tasks.estimated_minutes AS estimatedMinutes,
    tasks.external_provider AS externalProvider, tasks.external_id AS externalId,
    tasks.external_updated_at AS externalUpdatedAt,
    tasks.external_course_id AS externalCourseId, tasks.external_url AS externalUrl,
    tasks.external_status AS externalStatus, tasks.removed_at AS removedAt,
    tasks.created_at AS createdAt, tasks.updated_at AS updatedAt,
    courses.course_name AS courseName, courses.course_code AS courseCode,
    courses.semester
`;

function createTasksRepository(database) {
    function findOwned(taskId, courseId, userId) {
        return database.prepare(`SELECT ${SELECT} FROM course_tasks tasks
            JOIN courses ON courses.id = tasks.course_id
            WHERE tasks.id = ? AND tasks.course_id = ? AND courses.user_id = ?`
        ).get(taskId, courseId, userId);
    }
    return {
        listOwned(userId, filters = {}) {
            const clauses = ["courses.user_id = ?", "tasks.removed_at IS NULL"];
            const params = [userId];
            if (filters.courseId) { clauses.push("tasks.course_id = ?"); params.push(filters.courseId); }
            if (filters.type) { clauses.push("tasks.type = ?"); params.push(filters.type); }
            if (filters.status === "completed") clauses.push("tasks.completed_at IS NOT NULL");
            if (filters.status === "incomplete") clauses.push("tasks.completed_at IS NULL");
            if (filters.from) { clauses.push("tasks.due_at >= ?"); params.push(filters.from); }
            if (filters.to) { clauses.push("tasks.due_at <= ?"); params.push(filters.to); }
            return database.prepare(`SELECT ${SELECT} FROM course_tasks tasks
                JOIN courses ON courses.id = tasks.course_id
                WHERE ${clauses.join(" AND ")}
                ORDER BY tasks.due_at ASC, tasks.id ASC`).all(...params);
        },
        findOwned,
        createOwned(courseId, userId, task) {
            const result = database.prepare(`INSERT INTO course_tasks (
                course_id, title, type, description, due_at, start_at, completed_at,
                priority, unit_id, material_id, estimated_minutes,
                external_provider, external_id, external_updated_at
            ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (SELECT 1 FROM courses WHERE id = ? AND user_id = ?)`
            ).run(courseId, task.title, task.type, task.description, task.dueAt,
                task.startAt, task.completedAt, task.priority, task.unitId,
                task.materialId, task.estimatedMinutes, task.externalProvider,
                task.externalId, task.externalUpdatedAt, courseId, userId);
            return result.changes ? findOwned(Number(result.lastInsertRowid), courseId, userId) : undefined;
        },
        updateOwned(taskId, courseId, userId, task) {
            const current = findOwned(taskId, courseId, userId);
            if (!current) return undefined;
            database.prepare(`UPDATE course_tasks SET title=?, type=?, description=?, due_at=?,
                start_at=?, completed_at=?, priority=?, unit_id=?, material_id=?, estimated_minutes=?,
                external_provider=?, external_id=?, external_updated_at=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=? AND course_id=? AND EXISTS (
                    SELECT 1 FROM courses WHERE id=? AND user_id=?
                )`).run(task.title, task.type, task.description, task.dueAt, task.startAt,
                    task.completedAt, task.priority, task.unitId, task.materialId,
                    task.estimatedMinutes, task.externalProvider, task.externalId,
                    task.externalUpdatedAt, taskId, courseId, courseId, userId);
            return findOwned(taskId, courseId, userId);
        },
        deleteOwned(taskId, courseId, userId) {
            return database.prepare(`DELETE FROM course_tasks WHERE id=? AND course_id=?
                AND EXISTS (SELECT 1 FROM courses WHERE id=? AND user_id=?)`
            ).run(taskId, courseId, courseId, userId).changes > 0;
        }
    };
}
module.exports = { createTasksRepository };
