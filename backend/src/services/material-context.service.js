const { AppError } = require("../utils/app-error");
const { positiveInteger, validationError } = require("../utils/validation");

function createMaterialContextService({
    coursesService,
    materialsRepository,
    maxContextCharacters = 100000
}) {
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
            const emptyMaterial = orderedMaterials.find(material =>
                material.extraction_status !== "extracted" ||
                typeof material.text_content !== "string" ||
                material.text_content.trim() === ""
            );

            if (emptyMaterial) {
                throw new AppError({
                    code: "MATERIAL_HAS_NO_TEXT",
                    message: "This material does not contain extractable text yet. Try a typed PDF, DOCX, PPTX, or TXT file.",
                    status: 422,
                    details: {
                        materialId: emptyMaterial.id,
                        extractionStatus: emptyMaterial.extraction_status
                    }
                });
            }

            const courseContent = orderedMaterials.map(material =>
                `\n\n===== ${material.name} =====\n\n${material.text_content}`
            ).join("");

            if (courseContent.length > maxContextCharacters) {
                throw new AppError({
                    code: "AI_CONTEXT_TOO_LARGE",
                    message: "The selected materials exceed the AI context limit.",
                    status: 413,
                    details: {
                        contextCharacters: courseContent.length,
                        maxContextCharacters
                    }
                });
            }

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
