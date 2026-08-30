const { AppError } = require("../utils/app-error");
const { positiveInteger, validationError } = require("../utils/validation");
const { normalizeSourceText } = require("./source-text-normalization");

function createMaterialContextService({
    coursesService,
    materialsRepository,
    maxContextCharacters = 100000
}) {
    function resolveMaterials({ courseId, userId, materialIds }, { includeText = true } = {}) {
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

        const materials = (includeText
            ? materialsRepository.findContextByIds
            : materialsRepository.findContextMetadataByIds
        ).call(materialsRepository, courseId, userId, uniqueIds);

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
            (includeText
                ? typeof material.text_content !== "string" || material.text_content.trim() === ""
                : !Number.isInteger(material.text_length) || material.text_length === 0)
        );

        if (emptyMaterial) {
            throw new AppError({
                code: "MATERIAL_HAS_NO_TEXT",
                message: "This material does not contain usable extracted text yet. Try a typed document or a clearer PNG/JPEG note image.",
                status: 422,
                details: {
                    materialId: emptyMaterial.id,
                    extractionStatus: emptyMaterial.extraction_status
                }
            });
        }

        return {
            materialIds: uniqueIds,
            materials: orderedMaterials
        };
    }

    return {
        resolveMaterials,

        resolve(input) {
            const resolved = resolveMaterials(input);
            const courseContent = resolved.materials.map(material => {
                const text = normalizeSourceText(material.text_content);
                return `<source_document id="material-${material.id}" name=${JSON.stringify(material.name)} characters="${text.length}">\n${text}\n</source_document>`;
            }).join("\n\n");

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
                ...resolved,
                courseContent
            };
        }
    };
}

module.exports = {
    createMaterialContextService
};
