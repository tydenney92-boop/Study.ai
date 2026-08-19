function createMaterialsRepository(database) {
    const listFields = `
        materials.id,
        materials.course_id AS courseId,
        materials.unit_id AS unitId,
        materials.original_filename AS originalFilename,
        materials.stored_filename AS storedFilename,
        materials.material_type AS materialType,
        materials.file_size AS fileSize,
        materials.mime_type AS mimeType,
        materials.upload_status AS uploadStatus,
        materials.extraction_error AS extractionError,
        materials.extraction_status AS extractionStatus,
        materials.created_at AS createdAt,
        units.name AS unitName,
        units.unit_number AS unitNumber
    `;

    return {
        listOwned(courseId, userId) {
            return database.prepare(`
                SELECT ${listFields}
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                LEFT JOIN units ON units.id = materials.unit_id
                WHERE materials.course_id = ? AND courses.user_id = ?
                ORDER BY materials.created_at DESC, materials.id DESC
            `).all(courseId, userId);
        },

        listStoredFilenamesOwned(courseId, userId) {
            return database.prepare(`
                SELECT materials.stored_filename AS storedFilename
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                WHERE materials.course_id = ? AND courses.user_id = ?
            `).all(courseId, userId);
        },

        findOwned(materialId, courseId, userId) {
            return database.prepare(`
                SELECT ${listFields}, materials.extracted_text AS extractedText
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                LEFT JOIN units ON units.id = materials.unit_id
                WHERE materials.id = ?
                  AND materials.course_id = ?
                  AND courses.user_id = ?
            `).get(materialId, courseId, userId);
        },

        findContextByIds(courseId, userId, materialIds) {
            if (materialIds.length === 0) {
                return [];
            }

            const placeholders = materialIds.map(() => "?").join(",");

            return database.prepare(`
                SELECT
                    materials.id,
                    materials.original_filename AS name,
                    materials.extracted_text AS text_content,
                    materials.extraction_status AS extraction_status
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                WHERE materials.id IN (${placeholders})
                  AND materials.course_id = ?
                  AND courses.user_id = ?
            `).all(...materialIds, courseId, userId);
        },

        create(material) {
            const result = database.prepare(`
                INSERT INTO materials (
                    course_id,
                    unit_id,
                    original_filename,
                    stored_filename,
                    material_type,
                    extracted_text,
                    file_size,
                    mime_type,
                    upload_status,
                    extraction_error,
                    extraction_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                material.courseId,
                material.unitId,
                material.originalFilename,
                material.storedFilename,
                material.materialType,
                material.extractedText,
                material.fileSize,
                material.mimeType,
                material.uploadStatus,
                material.extractionError,
                material.extractionStatus
            );

            return Number(result.lastInsertRowid);
        },

        deleteOwned(materialId, courseId, userId) {
            return database.prepare(`
                DELETE FROM materials
                WHERE id = ?
                  AND course_id = ?
                  AND EXISTS (
                      SELECT 1 FROM courses
                      WHERE courses.id = materials.course_id
                        AND courses.user_id = ?
                  )
            `).run(materialId, courseId, userId).changes > 0;
        }
    };
}

module.exports = {
    createMaterialsRepository
};
