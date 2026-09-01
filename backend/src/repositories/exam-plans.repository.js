function parseIds(value) {
    try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function mapPlan(row, courseId) {
    return row ? {
        courseId: row.courseId,
        examName: row.examName || "",
        examDate: row.examDate || "",
        unitIds: parseIds(row.unitIdsJson),
        materialIds: parseIds(row.materialIdsJson),
        sourceMaterialIds: parseIds(row.sourceMaterialIdsJson),
        updatedAt: row.updatedAt
    } : {
        courseId,
        examName: "",
        examDate: "",
        unitIds: [],
        materialIds: [],
        sourceMaterialIds: [],
        updatedAt: null
    };
}

function createExamPlansRepository(database) {
    return {
        findOwned(courseId, userId) {
            const row = database.prepare(`
                SELECT settings.course_id AS courseId,
                       settings.exam_name AS examName,
                       settings.exam_date AS examDate,
                       settings.selected_unit_ids_json AS unitIdsJson,
                       settings.scoped_material_ids_json AS materialIdsJson,
                       settings.source_material_ids_json AS sourceMaterialIdsJson,
                       settings.updated_at AS updatedAt
                FROM course_exam_settings AS settings
                JOIN courses ON courses.id = settings.course_id
                WHERE settings.course_id = ? AND courses.user_id = ?
            `).get(courseId, userId);
            return mapPlan(row, courseId);
        },

        saveOwned(courseId, userId, plan) {
            database.prepare(`
                INSERT INTO course_exam_settings (
                    course_id, exam_name, exam_date, selected_unit_ids_json,
                    scoped_material_ids_json, source_material_ids_json
                )
                SELECT ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM courses WHERE id = ? AND user_id = ?)
                ON CONFLICT(course_id) DO UPDATE SET
                    exam_name = excluded.exam_name,
                    exam_date = excluded.exam_date,
                    selected_unit_ids_json = excluded.selected_unit_ids_json,
                    scoped_material_ids_json = excluded.scoped_material_ids_json,
                    source_material_ids_json = excluded.source_material_ids_json,
                    updated_at = CURRENT_TIMESTAMP
            `).run(
                courseId,
                plan.examName || null,
                plan.examDate || null,
                JSON.stringify(plan.unitIds),
                JSON.stringify(plan.materialIds),
                JSON.stringify(plan.sourceMaterialIds),
                courseId,
                userId
            );
            return this.findOwned(courseId, userId);
        }
    };
}

module.exports = { createExamPlansRepository };
