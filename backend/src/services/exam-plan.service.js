const { stringField, validationError, positiveInteger } = require("../utils/validation");

function idList(input, field) {
    const value = input[field];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw validationError(`${field} must be an array.`, { field });
    }
    const ids = value.map(id => positiveInteger(id, field));
    if (new Set(ids).size !== ids.length) {
        throw validationError(`${field} cannot contain duplicates.`, { field });
    }
    return ids;
}

function createExamPlanService({ coursesService, unitsRepository, materialsRepository, examPlansRepository }) {
    function filtered(plan, courseId, userId) {
        const units = unitsRepository.listOwned(courseId, userId);
        const materials = materialsRepository.listOwned(courseId, userId);
        const unitIds = new Set(units.map(unit => unit.id));
        const materialIds = new Set(materials.map(material => material.id));
        return {
            ...plan,
            unitIds: plan.unitIds.filter(id => unitIds.has(id)),
            materialIds: plan.materialIds.filter(id => materialIds.has(id)),
            sourceMaterialIds: plan.sourceMaterialIds.filter(id => materialIds.has(id)),
            units,
            materials
        };
    }

    return {
        get(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return filtered(examPlansRepository.findOwned(courseId, userId), courseId, userId);
        },

        save(courseId, userId, input) {
            coursesService.requireOwned(courseId, userId);
            const examName = stringField(input, "examName", {
                optional: true, allowEmpty: true, maxLength: 100
            }) || "";
            const examDate = stringField(input, "examDate", {
                optional: true, allowEmpty: true, maxLength: 10
            }) || "";
            if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
                throw validationError("examDate must use YYYY-MM-DD.", { field: "examDate" });
            }
            const unitIds = idList(input, "unitIds");
            const materialIds = idList(input, "materialIds");
            const sourceMaterialIds = idList(input, "sourceMaterialIds");
            const ownedUnits = unitsRepository.listOwned(courseId, userId);
            const ownedMaterials = materialsRepository.listOwned(courseId, userId);
            const ownedUnitIds = new Set(ownedUnits.map(unit => unit.id));
            const ownedMaterialMap = new Map(ownedMaterials.map(material => [material.id, material]));
            if (unitIds.some(id => !ownedUnitIds.has(id)) ||
                [...materialIds, ...sourceMaterialIds].some(id => !ownedMaterialMap.has(id))) {
                throw validationError("Exam scope must use materials and units from this course.");
            }
            if (sourceMaterialIds.some(id =>
                ownedMaterialMap.get(id).extractionStatus !== "extracted"
            )) {
                throw validationError("Exam sources must contain usable extracted text.", {
                    field: "sourceMaterialIds"
                });
            }
            return filtered(examPlansRepository.saveOwned(courseId, userId, {
                examName, examDate, unitIds, materialIds, sourceMaterialIds
            }), courseId, userId);
        }
    };
}

module.exports = { createExamPlanService };
