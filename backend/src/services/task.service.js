const { AppError } = require("../utils/app-error");
const { positiveInteger, stringField, validationError } = require("../utils/validation");
const TYPES = new Set(["assignment", "exam", "quiz", "reading", "project", "paper", "other"]);
const PRIORITIES = new Set(["low", "normal", "high"]);

function notFound() { return new AppError({ code: "NOT_FOUND", message: "Task not found.", status: 404 }); }
function iso(value, field, optional = false) {
    if ((value === undefined || value === null || value === "") && optional) return value === undefined ? undefined : null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
        throw validationError(`${field} must be an ISO 8601 timestamp.`, { field });
    }
    return new Date(value).toISOString();
}
function optionalId(value, field) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return positiveInteger(value, field);
}
function createTaskService({ coursesService, unitsRepository, materialsRepository, tasksRepository }) {
    function validate(courseId, userId, input, current = {}) {
        const task = { ...current };
        if (input.title !== undefined || !current.id) task.title = stringField(input, "title", { maxLength: 200 });
        if (input.type !== undefined || !current.id) {
            task.type = stringField(input, "type", { maxLength: 30 });
            if (!TYPES.has(task.type)) throw validationError("type is not supported.", { field: "type" });
        }
        if (input.description !== undefined || !current.id) task.description = stringField(input, "description", { optional: true, allowEmpty: true, maxLength: 4000 }) || "";
        if (input.dueAt !== undefined || !current.id) task.dueAt = iso(input.dueAt, "dueAt");
        if (input.startAt !== undefined) task.startAt = iso(input.startAt, "startAt", true);
        else if (!current.id) task.startAt = null;
        if (input.completed !== undefined) {
            if (typeof input.completed !== "boolean") throw validationError("completed must be a boolean.", { field: "completed" });
            task.completedAt = input.completed ? new Date().toISOString() : null;
        } else if (!current.id) task.completedAt = null;
        if (input.priority !== undefined) {
            task.priority = input.priority === null || input.priority === "" ? null : input.priority;
            if (task.priority && !PRIORITIES.has(task.priority)) throw validationError("priority is not supported.", { field: "priority" });
        } else if (!current.id) task.priority = null;
        for (const [key, field] of [["unitId", "unitId"], ["materialId", "materialId"]]) {
            const value = optionalId(input[key], field);
            if (value !== undefined) task[key] = value;
            else if (!current.id) task[key] = null;
        }
        if (input.estimatedMinutes !== undefined) {
            task.estimatedMinutes = input.estimatedMinutes === null || input.estimatedMinutes === "" ? null : positiveInteger(input.estimatedMinutes, "estimatedMinutes");
        } else if (!current.id) task.estimatedMinutes = null;
        for (const field of ["externalProvider", "externalId"]) {
            if (input[field] !== undefined) task[field] = stringField(input, field, { optional: true, allowEmpty: true, maxLength: 200 }) || null;
            else if (!current.id) task[field] = null;
        }
        if (input.externalUpdatedAt !== undefined) task.externalUpdatedAt = iso(input.externalUpdatedAt, "externalUpdatedAt", true);
        else if (!current.id) task.externalUpdatedAt = null;
        const units = task.unitId ? unitsRepository.listOwned(courseId, userId) : [];
        const materials = task.materialId ? materialsRepository.listOwned(courseId, userId) : [];
        if (task.unitId && !units.some(item => item.id === task.unitId)) throw validationError("unitId must belong to this course.", { field: "unitId" });
        if (task.materialId && !materials.some(item => item.id === task.materialId)) throw validationError("materialId must belong to this course.", { field: "materialId" });
        return task;
    }
    const decorate = task => task && ({ ...task, completed: Boolean(task.completedAt) });
    return {
        list(userId, filters) { return tasksRepository.listOwned(userId, filters).map(decorate); },
        listCourse(courseId, userId, filters) { coursesService.requireOwned(courseId, userId); return this.list(userId, { ...filters, courseId }); },
        create(courseId, userId, input) { coursesService.requireOwned(courseId, userId); return decorate(tasksRepository.createOwned(courseId, userId, validate(courseId, userId, input))); },
        update(courseId, taskId, userId, input) { coursesService.requireOwned(courseId, userId); const current = tasksRepository.findOwned(taskId, courseId, userId); if (!current) throw notFound(); return decorate(tasksRepository.updateOwned(taskId, courseId, userId, validate(courseId, userId, input, current))); },
        delete(courseId, taskId, userId) { coursesService.requireOwned(courseId, userId); if (!tasksRepository.deleteOwned(taskId, courseId, userId)) throw notFound(); return { deleted: true, id: taskId }; }
    };
}
module.exports = { createTaskService, TYPES };
