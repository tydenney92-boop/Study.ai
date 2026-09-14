const { AppError } = require("../utils/app-error");
const { positiveInteger, validationError } = require("../utils/validation");
const { parseSchedule, parseDate } = require("./schedule-parser");
const { TYPES } = require("./task.service");

function createScheduleImportService({ coursesService, materialsRepository, repository, aiExtractor, aiUsageGuard }) {
    function source(courseId, userId, materialId) {
        coursesService.requireOwned(courseId, userId);
        const material = materialsRepository.findOwned(positiveInteger(materialId, "materialId"), courseId, userId);
        if (!material) throw new AppError({ code: "NOT_FOUND", message: "Material not found.", status: 404 });
        if (material.extractionStatus !== "extracted" || !material.extractedText?.trim()) {
            throw new AppError({ code: "SCHEDULE_SOURCE_UNAVAILABLE", message: "We could not extract usable text from this file. Try a clearer image or a text-based PDF.", status: 409 });
        }
        return material;
    }

    async function parsed(courseId, userId, materialId) {
        const course = coursesService.requireOwned(courseId, userId);
        const material = source(courseId, userId, materialId);
        const result = parseSchedule(material.extractedText, { semester: course.semester });
        let aiFallback = "not_needed";
        if (aiExtractor?.shouldUseAi(result)) {
            const operation = () => aiExtractor.extract(material.extractedText, { semester: course.semester });
            let ai;
            try {
                ai = await (aiUsageGuard ? aiUsageGuard.execute(userId, operation) : operation());
            } catch (error) {
                ai = { status: "unavailable", candidates: [] };
            }
            aiFallback = ai.status;
            const keys = new Set(result.candidates.map(candidate => candidate.key));
            for (const candidate of ai.candidates) {
                if (!keys.has(candidate.key)) { keys.add(candidate.key); result.candidates.push(candidate); }
            }
        }
        const existing = new Map(repository.existing(courseId).map(task => [task.key, task]));
        result.candidates = result.candidates.map(candidate => {
            const task = existing.get(candidate.key);
            if (!task) return { ...candidate, importState: "new", existingTask: null };
            const semesterYear = Number(String(course.semester || "").match(/20\d{2}/)?.[0]);
            const oldDate = parseDate(task.sourceText || "", semesterYear);
            const sameDate = oldDate?.date && candidate.dueDate && oldDate.date === candidate.dueDate;
            return { ...candidate, importState: sameDate ? "already_imported" : "potentially_changed", existingTask: task, selected: false };
        });
        result.summary = {
            confirmed: result.candidates.filter(candidate => candidate.status === "confirmed").length,
            ambiguous: result.candidates.filter(candidate => candidate.status === "ambiguous").length,
            highConfidence: result.candidates.filter(candidate => candidate.confidence === "high").length,
            other: result.candidates.filter(candidate => candidate.confidence !== "high").length,
            new: result.candidates.filter(candidate => candidate.importState === "new").length,
            alreadyImported: result.candidates.filter(candidate => candidate.importState === "already_imported").length,
            potentiallyChanged: result.candidates.filter(candidate => candidate.importState === "potentially_changed").length
        };
        return { material: { id: material.id, displayName: material.displayName, materialRole: material.materialRole, materialType: material.materialType }, aiFallback, ...result };
    }

    return {
        preview: parsed,
        async import(courseId, userId, input) {
            const preview = await parsed(courseId, userId, input.materialId);
            const allowed = new Map(preview.candidates.map(candidate => [candidate.key, candidate]));
            const items = [];
            let alreadySkipped = 0;
            if (!Array.isArray(input.candidates)) throw validationError("candidates must be an array.");
            for (const edit of input.candidates) {
                const original = allowed.get(edit.key);
                if (!original) throw validationError("Candidate is not supported by this source.");
                if (typeof edit.title !== "string" || !edit.title.trim() || edit.title.length > 200) throw validationError("Candidate title is invalid.");
                if (!TYPES.has(edit.type)) throw validationError("Candidate type is invalid.");
                if (typeof edit.dueAt !== "string" || Number.isNaN(Date.parse(edit.dueAt))) throw validationError("Candidate due date must be resolved before import.");
                const action = edit.action || "create";
                if (original.importState === "already_imported") { alreadySkipped++; continue; }
                if (original.importState === "potentially_changed" && !["update", "keep"].includes(action)) throw validationError("Choose whether to update or keep the existing deadline.");
                if (original.importState === "new" && action !== "create") throw validationError("New candidates must use the create action.");
                items.push({ key: edit.key, title: edit.title.trim(), type: edit.type, dueAt: new Date(edit.dueAt).toISOString(), sourceText: original.sourceText, action, existingTaskId: original.existingTask?.id });
            }
            const result = repository.createMany(courseId, Number(input.materialId), items);
            return { ...result, skipped: result.skipped + alreadySkipped };
        }
    };
}

module.exports = { createScheduleImportService };
