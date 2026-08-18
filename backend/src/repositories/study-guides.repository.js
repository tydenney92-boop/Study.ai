function createStudyGuidesRepository(database) {
    const insertWithMaterials = database.transaction(input => {
        const result = database.prepare(`
            INSERT INTO generated_study_guides (
                user_id, course_id, generated_content
            ) VALUES (?, ?, ?)
        `).run(input.userId, input.courseId, input.generatedContent);

        const studyGuideId = Number(result.lastInsertRowid);
        const insertContext = database.prepare(`
            INSERT INTO study_guide_materials (study_guide_id, material_id)
            VALUES (?, ?)
        `);

        for (const materialId of input.materialIds) {
            insertContext.run(studyGuideId, materialId);
        }

        return studyGuideId;
    });

    return {
        createWithMaterials(input) {
            const studyGuideId = insertWithMaterials(input);
            return this.findOwned(studyGuideId, input.userId);
        },

        findOwned(studyGuideId, userId) {
            const guide = database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    course_id AS courseId,
                    generated_content AS generatedContent,
                    created_at AS createdAt
                FROM generated_study_guides
                WHERE id = ? AND user_id = ?
            `).get(studyGuideId, userId);

            if (!guide) {
                return undefined;
            }

            guide.materialIds = database.prepare(`
                SELECT material_id AS materialId
                FROM study_guide_materials
                WHERE study_guide_id = ?
                ORDER BY material_id
            `).all(studyGuideId).map(row => row.materialId);

            return guide;
        }
    };
}

module.exports = {
    createStudyGuidesRepository
};
