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
        const insertSource = database.prepare(`
            INSERT INTO study_guide_sources (
                study_guide_id, source_order, material_id, material_name
            ) VALUES (?, ?, ?, ?)
        `);

        input.sources.forEach((source, index) => {
            insertContext.run(studyGuideId, source.materialId);
            insertSource.run(
                studyGuideId,
                index,
                source.materialId,
                source.materialName
            );
        });
        return studyGuideId;
    });

    function sourcesFor(studyGuideId) {
        const sources = database.prepare(`
            SELECT
                material_id AS materialId,
                material_name AS materialName
            FROM study_guide_sources
            WHERE study_guide_id = ?
            ORDER BY source_order
        `).all(studyGuideId);
        return sources.length > 0
            ? sources
            : [{ materialId: null, materialName: "Source material unavailable" }];
    }

    function mapGuide(guide, includeContent = true) {
        const mapped = {
            id: guide.id,
            userId: guide.userId,
            courseId: guide.courseId,
            createdAt: guide.createdAt,
            sources: sourcesFor(guide.id)
        };
        if (includeContent) mapped.generatedContent = guide.generatedContent;
        mapped.materialIds = mapped.sources
            .map(source => source.materialId)
            .filter(id => id !== null)
            .sort((a, b) => a - b);
        return mapped;
    }

    return {
        createWithMaterials(input) {
            const studyGuideId = insertWithMaterials(input);
            return this.findOwned(studyGuideId, input.userId);
        },

        findOwned(studyGuideId, userId, courseId = null) {
            const guide = database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    course_id AS courseId,
                    generated_content AS generatedContent,
                    created_at AS createdAt
                FROM generated_study_guides
                WHERE id = ? AND user_id = ?
                  AND (? IS NULL OR course_id = ?)
            `).get(studyGuideId, userId, courseId, courseId);
            return guide ? mapGuide(guide) : undefined;
        },

        listOwned(courseId, userId) {
            return database.prepare(`
                SELECT
                    id,
                    user_id AS userId,
                    course_id AS courseId,
                    created_at AS createdAt
                FROM generated_study_guides
                WHERE course_id = ? AND user_id = ?
                ORDER BY created_at DESC, id DESC
            `).all(courseId, userId).map(guide => mapGuide(guide, false));
        },

        deleteOwned(studyGuideId, courseId, userId) {
            const remove = database.transaction(() => database.prepare(`
                DELETE FROM generated_study_guides
                WHERE id = ? AND course_id = ? AND user_id = ?
            `).run(studyGuideId, courseId, userId).changes > 0);
            return remove();
        }
    };
}

module.exports = { createStudyGuidesRepository };
