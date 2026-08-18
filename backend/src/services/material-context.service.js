const { AppError } = require("../utils/app-error");
const { positiveInteger, validationError } = require("../utils/validation");

function createMaterialContextService({ coursesService, materialsRepository }) {
    return {
        resolve({ courseId, userId, materialIds }) {
            coursesService.requireOwned(courseId, userId);

            if (!Array.isArray(materialIds) || materialIds.length === 0) {
                throw validationError("materialIds must be a non-empty array.", {
                    field: "materialIds"
                });
            }

            const normalizedIds = materialIds.map(materialId =>
                positiveInteger(materialId, "materialIds")
            );
            const uniqueIds = [...new Set(normalizedIds)];

            if (uniqueIds.length !== normalizedIds.length) {
                throw validationError("materialIds cannot contain duplicates.", {
                    field: "materialIds"
                });
            }

            const materials = materialsRepository.findContextByIds(
                courseId,
                userId,
                uniqueIds
            );

            if (materials.length !== uniqueIds.length) {
                throw new AppError({
                    code: "MATERIAL_CONTEXT_INVALID",
                    message: "Every selected material must belong to this course.",
                    status: 404
                });
            }

            const materialsById = new Map(
                materials.map(material => [material.id, material])
            );
            const orderedMaterials = uniqueIds.map(id => materialsById.get(id));
            const courseContent = orderedMaterials.map(material =>
                `\n\n===== ${material.name} =====\n\n${material.text_content || ""}`
            ).join("");

            return {
                materialIds: uniqueIds,
                materials: orderedMaterials,
                courseContent
            };
        }
    };
}

module.exports = {
    createMaterialContextService
};
