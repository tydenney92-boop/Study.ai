const express = require("express");
const { positiveInteger, requestObject, validationError } = require("../utils/validation");
function filters(query) {
    const result = {};
    if (query.courseId !== undefined) result.courseId = positiveInteger(query.courseId, "courseId");
    if (query.type) result.type = String(query.type);
    if (query.status) {
        if (!["completed", "incomplete", "all"].includes(query.status)) throw validationError("status is not supported.", { field: "status" });
        if (query.status !== "all") result.status = query.status;
    }
    if (query.upcoming === "true") { result.status = "incomplete"; result.from = new Date().toISOString(); }
    for (const field of ["from", "to"]) {
        if (!query[field]) continue;
        const date = new Date(query[field]);
        if (Number.isNaN(date.getTime())) throw validationError(`${field} must be an ISO 8601 timestamp.`, { field });
        result[field] = date.toISOString();
    }
    return result;
}
function createTasksRouter({ taskService }) {
    const router = express.Router();
    router.get("/", (req, res) => res.json(taskService.list(req.user.id, filters(req.query))));
    return router;
}
function createCourseTasksRouter({ taskService }) {
    const router = express.Router({ mergeParams: true });
    router.use((req, _res, next) => { req.courseId = positiveInteger(req.params.courseId, "courseId"); next(); });
    router.get("/", (req, res) => res.json(taskService.listCourse(req.courseId, req.user.id, filters(req.query))));
    router.post("/", (req, res) => { requestObject(req.body); res.status(201).json(taskService.create(req.courseId, req.user.id, req.body)); });
    router.patch("/:taskId", (req, res) => { requestObject(req.body); res.json(taskService.update(req.courseId, positiveInteger(req.params.taskId, "taskId"), req.user.id, req.body)); });
    router.delete("/:taskId", (req, res) => res.json(taskService.delete(req.courseId, positiveInteger(req.params.taskId, "taskId"), req.user.id)));
    return router;
}
module.exports = { createTasksRouter, createCourseTasksRouter };
