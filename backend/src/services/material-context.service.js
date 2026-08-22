const { AppError } = require("../utils/app-error");
const { positiveInteger, validationError } = require("../utils/validation");

function createMaterialContextService({
    coursesService,
    materialsRepository,
    maxContextCharacters = 100000
}) {
    function normalizeSourceText(value) {
        const pages = value.replace(/\r\n?/g, "\n").split("\f");
        if (pages.length > 1) {
            const edges = pages.map(page => page.split("\n").map(line => line.trim()).filter(Boolean));
            const counts = new Map();
            edges.forEach(lines => [lines[0], lines.at(-1)].filter(Boolean).forEach(line => {
                if (line.length <= 120) counts.set(line, (counts.get(line) || 0) + 1);
            }));
            const boilerplate = new Set([...counts].filter(([, count]) => count >= 3).map(([line]) => line));
            pages.forEach((page, index) => {
                pages[index] = page.split("\n").filter(line => !boilerplate.has(line.trim())).join("\n");
            });
        }
        return pages.join("\n\n")
            .replace(/^(.{1,120})\n\1(?:\n|$)/gm, "$1\n")
            .replace(/[\t ]+$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

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

            const courseContent = orderedMaterials.map(material => {
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
