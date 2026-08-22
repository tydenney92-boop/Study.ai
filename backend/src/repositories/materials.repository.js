function createMaterialsRepository(database) {
    const listFields = `
        materials.id,
        materials.course_id AS courseId,
        materials.unit_id AS unitId,
        COALESCE(materials.display_name, materials.original_filename) AS displayName,
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
        listOwned(courseId, userId, search = "") {
            const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
            const pattern = `%${escapedSearch}%`;
            return database.prepare(`
                SELECT ${listFields}
                FROM materials
                JOIN courses ON courses.id = materials.course_id
                LEFT JOIN units ON units.id = materials.unit_id
                WHERE materials.course_id = ? AND courses.user_id = ?
                  AND (
                      ? = ''
                      OR COALESCE(materials.display_name, materials.original_filename)
                          LIKE ? ESCAPE '\\'
                      OR materials.original_filename LIKE ? ESCAPE '\\'
                      OR materials.extracted_text LIKE ? ESCAPE '\\'
                  )
                ORDER BY materials.created_at DESC, materials.id DESC
            `).all(courseId, userId, search, pattern, pattern, pattern);
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
                    COALESCE(materials.display_name, materials.original_filename) AS name,
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
                    display_name,
                    original_filename,
                    stored_filename,
                    material_type,
                    extracted_text,
                    file_size,
                    mime_type,
                    upload_status,
                    extraction_error,
                    extraction_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                material.courseId,
                material.unitId,
                material.displayName,
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

        updateOwned(materialId, courseId, userId, changes) {
            const current = this.findOwned(materialId, courseId, userId);
            if (!current) {
                return undefined;
            }

            database.prepare(`
                UPDATE materials
                SET display_name = ?, unit_id = ?
                WHERE id = ?
                  AND course_id = ?
                  AND EXISTS (
                      SELECT 1 FROM courses
                      WHERE courses.id = materials.course_id
                        AND courses.user_id = ?
                  )
            `).run(
                changes.displayName ?? current.displayName,
                changes.unitId === undefined ? current.unitId : changes.unitId,
                materialId,
                courseId,
                userId
            );

            return this.findOwned(materialId, courseId, userId);
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
