const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");

const base = { title: "Problem set 4", type: "assignment", dueAt: "2026-09-12T23:59:00.000Z" };

test("planner tasks create, edit, complete, uncomplete, filter, sort, and delete", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const materialId = insertMaterial(context.database);
    const later = await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ ...base, materialId, unitId: 1, estimatedMinutes: 45 }).expect(201);
    assert.equal(later.body.courseCode, "ECON 110");
    assert.equal(later.body.completed, false);
    const earlier = await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ title: "Midterm", type: "exam", dueAt: "2026-09-10T18:00:00.000Z" }).expect(201);
    const sorted = await authenticatedRequest(context.app).get("/api/tasks?status=incomplete").expect(200);
    assert.deepEqual(sorted.body.map(item => item.id), [earlier.body.id, later.body.id]);
    assert.equal((await authenticatedRequest(context.app).get("/api/tasks?type=exam").expect(200)).body.length, 1);
    assert.equal((await authenticatedRequest(context.app).get("/api/courses/1/tasks?from=2026-09-11T00:00:00.000Z").expect(200)).body[0].id, later.body.id);
    const edited = await authenticatedRequest(context.app).patch(`/api/courses/1/tasks/${later.body.id}`).send({ title: "Revised problem set", completed: true }).expect(200);
    assert.equal(edited.body.title, "Revised problem set"); assert.equal(edited.body.completed, true);
    assert.equal((await authenticatedRequest(context.app).get("/api/tasks?status=completed").expect(200)).body.length, 1);
    assert.equal((await authenticatedRequest(context.app).patch(`/api/courses/1/tasks/${later.body.id}`).send({ completed: false }).expect(200)).body.completed, false);
    await authenticatedRequest(context.app).delete(`/api/courses/1/tasks/${later.body.id}`).expect(200);
    await authenticatedRequest(context.app).patch(`/api/courses/1/tasks/${later.body.id}`).send({ title: "Gone" }).expect(404);
});

test("planner tasks enforce course ownership and linked entity ownership", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({ name: "Other", email: "planner-other@example.com", password: "StrongPass123!" }).expect(201);
    const otherCourse = await other.post("/api/courses").send({ courseName: "Private", courseCode: "PVT 1", semester: "Fall 2026" }).expect(201);
    const task = await authenticatedRequest(context.app).post("/api/courses/1/tasks").send(base).expect(201);
    await other.get("/api/courses/1/tasks").expect(404);
    await other.patch(`/api/courses/1/tasks/${task.body.id}`).send({ completed: true }).expect(404);
    assert.equal((await other.get("/api/tasks").expect(200)).body.length, 0);
    await authenticatedRequest(context.app).post(`/api/courses/${otherCourse.body.id}/tasks`).send(base).expect(404);
    await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ ...base, unitId: 9999 }).expect(400);
});

test("planner timestamps stay normalized UTC and preserve overdue range semantics", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const item = await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ ...base, dueAt: "2026-09-09T18:30:00-06:00" }).expect(201);
    assert.equal(item.body.dueAt, "2026-09-10T00:30:00.000Z");
    const before = await authenticatedRequest(context.app).get("/api/tasks?to=2026-09-10T00:30:00.000Z&status=incomplete").expect(200);
    assert.equal(before.body.length, 1);
    await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ ...base, type: "homework" }).expect(400);
    await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({ ...base, dueAt: "09/12/2026" }).expect(400);
});
