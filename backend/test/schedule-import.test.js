const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");
const { JPEG_FIXTURE, PNG_FIXTURE } = require("./helpers/image-fixtures");

test("schedule preview requires review and confirmed import is transactional and duplicate-safe", async t => {
    const ctx = createTestApp(); t.after(ctx.cleanup);
    ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
    const id = insertMaterial(ctx.database, { originalFilename: "syllabus.txt", extractedText: "Homework 1 — September 12\nQuiz 1 — September 19\nFinal paper due during finals week." });
    const preview = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: id }).expect(200)).body;
    assert.equal(preview.summary.confirmed, 2); assert.equal(preview.summary.ambiguous, 1); assert.equal(preview.candidates[2].selected, false);
    const chosen = preview.candidates.slice(0, 2).map((item, index) => ({ key: item.key, title: index ? "Edited Quiz" : "Homework 1", type: item.type, dueAt: index ? "2026-09-20T05:59:00.000Z" : "2026-09-13T05:59:00.000Z" }));
    let result = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId: id, candidates: chosen }).expect(201)).body;
    assert.equal(result.created, 2);
    result = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId: id, candidates: chosen }).expect(201)).body;
    assert.equal(result.created, 0); assert.equal(result.skipped, 2);
    const tasks = (await authenticatedRequest(ctx.app).get("/api/tasks")).body;
    assert.equal(tasks.length, 2); assert.equal(tasks[1].scheduleSourceMaterialId, id); assert.match(tasks[1].scheduleSourceSnippet, /Quiz 1/);
});

test("schedule import enforces material ownership and usable extraction", async t => {
    const ctx = createTestApp(); t.after(ctx.cleanup);
    const bad = insertMaterial(ctx.database, { originalFilename: "scan.pdf", extractedText: "", extractionStatus: "no_text" });
    await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: bad }).expect(409);
    const other = supertest.agent(ctx.app);
    await other.post("/api/auth/register").send({ name: "Other", email: "schedule-other@example.com", password: "StrongPass123!" }).expect(201);
    await other.post("/api/courses/1/schedule-import/preview").send({ materialId: bad }).expect(404);
});

test("reimporting the same event from a changed schedule requires an explicit update", async t => {
    const ctx = createTestApp(); t.after(ctx.cleanup);
    ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
    const first = insertMaterial(ctx.database, { storedFilename: "schedule-one.txt", originalFilename: "schedule-one.txt", extractedText: "Homework 1 due September 12\nQuiz 1 due September 15" });
    let preview = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: first }).expect(200)).body;
    await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId: first, candidates: [{ key: preview.candidates[0].key, title: "Homework 1", type: "assignment", dueAt: "2026-09-13T05:59:00.000Z", action: "create" }] }).expect(201);
    const changed = insertMaterial(ctx.database, { storedFilename: "schedule-two.txt", originalFilename: "schedule-two.txt", extractedText: "Homework 1 due September 14\nQuiz 1 due September 15" });
    preview = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: changed }).expect(200)).body;
    const homework = preview.candidates.find(item => item.title === "Homework 1");
    assert.equal(homework.importState, "potentially_changed");
    await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId: changed, candidates: [{ key: homework.key, title: homework.title, type: homework.type, dueAt: "2026-09-15T05:59:00.000Z" }] }).expect(400);
    const result = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId: changed, candidates: [{ key: homework.key, title: homework.title, type: homework.type, dueAt: "2026-09-15T05:59:00.000Z", action: "update" }] }).expect(201)).body;
    assert.equal(result.updated, 1);
    assert.equal(ctx.database.prepare("SELECT count(*) AS count FROM course_tasks").get().count, 1);
});

test("direct PDF, PNG, and JPEG schedule uploads reuse material extraction", async t => {
    const ctx = createTestApp({ textExtractionService: { async extract() { return { text: "Exam 1 Sep 29\nHomework 1 Sep 18", status: "extracted", method: "native" }; } } });
    t.after(ctx.cleanup);
    ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
    const uploads = [
        { filename: "schedule.pdf", contentType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") },
        { filename: "schedule.png", contentType: "image/png", buffer: PNG_FIXTURE },
        { filename: "schedule.jpg", contentType: "image/jpeg", buffer: JPEG_FIXTURE }
    ];
    for (const upload of uploads) {
        const response = await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/upload").attach("file", upload.buffer, upload).expect(201);
        assert.equal(response.body.material.materialRole, "syllabus");
        assert.equal(response.body.candidates.length, 2);
    }
});

test("schedule reconciliation never overwrites a manual Planner task", async t => {
    const ctx = createTestApp(); t.after(ctx.cleanup);
    ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
    const manual = ctx.database.prepare("INSERT INTO course_tasks(course_id,title,type,due_at) VALUES(1,'Homework 1','assignment','2026-09-10T05:59:00.000Z')").run();
    const materialId = insertMaterial(ctx.database, { storedFilename: "manual-safe.txt", extractedText: "Homework 1 due September 12\nQuiz 1 due September 15" });
    const preview = (await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId }).expect(200)).body;
    const homework = preview.candidates.find(candidate => candidate.title === "Homework 1");
    assert.equal(homework.importState, "new");
    await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({ materialId, candidates: [{ key: homework.key, title: homework.title, type: homework.type, dueAt: "2026-09-13T05:59:00.000Z", action: "create" }] }).expect(201);
    const unchanged = ctx.database.prepare("SELECT title,due_at AS dueAt,schedule_import_key AS scheduleKey FROM course_tasks WHERE id=?").get(Number(manual.lastInsertRowid));
    assert.deepEqual(unchanged, { title: "Homework 1", dueAt: "2026-09-10T05:59:00.000Z", scheduleKey: null });
    assert.equal(ctx.database.prepare("SELECT count(*) AS count FROM course_tasks").get().count, 2);
});

test("deterministic success avoids AI while ambiguous extraction uses the mocked fallback", async t => {
    let calls = 0;
    const ctx = createTestApp({ aiClient: {
        provider: "fake",
        async generate() { calls++; return JSON.stringify({ events: [] }); }
    } });
    t.after(ctx.cleanup);
    ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
    const clear = insertMaterial(ctx.database, { storedFilename: "clear-schedule.txt", extractedText: "Homework 1 due Sep 12\nQuiz 1 due Sep 18" });
    let response = await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: clear }).expect(200);
    assert.equal(response.body.aiFallback, "not_needed");
    assert.equal(calls, 0);
    const ambiguous = insertMaterial(ctx.database, { storedFilename: "ambiguous-schedule.txt", extractedText: "Final paper due during finals week." });
    response = await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({ materialId: ambiguous }).expect(200);
    assert.equal(response.body.aiFallback, "used");
    assert.equal(calls, 1);
    assert.equal(response.body.candidates[0].selected, false);
});
