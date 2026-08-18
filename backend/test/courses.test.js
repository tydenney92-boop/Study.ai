const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authenticatedRequest: request } = require("./helpers/test-app");
const { createTestApp } = require("./helpers/test-app");

test("courses can be created, listed, retrieved, updated, and deleted", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const created = await request(context.app)
        .post("/api/courses")
        .send({
            courseName: "Biology",
            courseCode: "BIO 101",
            semester: "Fall 2026"
        })
        .expect(201);

    assert.equal(created.body.userId, 1);
    assert.equal(created.body.courseName, "Biology");

    const listed = await request(context.app)
        .get("/api/courses")
        .expect(200);

    assert.equal(listed.body.length, 2);
    assert.ok(listed.body.some(course => course.id === created.body.id));

    const retrieved = await request(context.app)
        .get(`/api/courses/${created.body.id}`)
        .expect(200);

    assert.equal(retrieved.body.courseCode, "BIO 101");

    const updated = await request(context.app)
        .patch(`/api/courses/${created.body.id}`)
        .send({ courseName: "General Biology", semester: "Winter 2027" })
        .expect(200);

    assert.equal(updated.body.courseName, "General Biology");
    assert.equal(updated.body.semester, "Winter 2027");

    await request(context.app)
        .delete(`/api/courses/${created.body.id}`)
        .expect(204);

    await request(context.app)
        .get(`/api/courses/${created.body.id}`)
        .expect(404);
});

test("course routes reject invalid IDs, bodies, duplicates, and other users", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    await request(context.app)
        .get("/api/courses/not-a-number")
        .expect(400);

    await request(context.app)
        .post("/api/courses")
        .send({ courseName: "Missing fields" })
        .expect(400);

    await request(context.app)
        .post("/api/courses")
        .send({
            courseName: "Duplicate",
            courseCode: "ECON 110",
            semester: "Legacy Prototype"
        })
        .expect(409);

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other User', 'other@example.com')
    `).run().lastInsertRowid);
    const otherCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private Course', 'PRIVATE 1', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);

    await request(context.app)
        .get(`/api/courses/${otherCourseId}`)
        .expect(404);

    await request(context.app)
        .patch(`/api/courses/${otherCourseId}`)
        .send({ courseName: "Unauthorized change" })
        .expect(404);

    await request(context.app)
        .delete(`/api/courses/${otherCourseId}`)
        .expect(404);
});

test("opening a course updates persisted ordering and remains ownership scoped", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const created = await request(context.app).post("/api/courses").send({
        courseName: "Recent Biology",
        courseCode: "BIO 202",
        semester: "Fall 2026"
    }).expect(201);
    context.database.prepare("UPDATE courses SET created_at = '2020-01-01 00:00:00' WHERE id = ?")
        .run(created.body.id);

    await request(context.app).post(`/api/courses/${created.body.id}/open`).send({}).expect(200);
    const listed = await request(context.app).get("/api/courses").expect(200);
    assert.equal(listed.body[0].id, created.body.id);
    assert.ok(listed.body[0].lastOpenedAt);

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other User', 'open-other@example.com')
    `).run().lastInsertRowid);
    const otherCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private', 'PRIVATE', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);
    await request(context.app).post(`/api/courses/${otherCourseId}/open`).send({}).expect(404);
    assert.equal(
        context.database.prepare("SELECT last_opened_at FROM courses WHERE id = ?").get(otherCourseId).last_opened_at,
        null
    );
});

test("deleting a course cascades relational data and removes stored materials", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const storedPath = path.join(context.temporaryDirectory, "uploads", "keep.txt");
    fs.writeFileSync(storedPath, "stored course content");

    const materialId = Number(context.database.prepare(`
        INSERT INTO materials (
            course_id, unit_id, original_filename, stored_filename,
            material_type, extracted_text, upload_status
        ) VALUES (1, 1, 'keep.txt', 'keep.txt', 'notes', '', 'ready')
    `).run().lastInsertRowid);
    const quizId = Number(context.database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (1, 1, '{"questions":[]}')
    `).run().lastInsertRowid);
    context.database.prepare("INSERT INTO quiz_materials (quiz_id, material_id) VALUES (?, ?)")
        .run(quizId, materialId);
    context.database.prepare(`
        INSERT INTO quiz_attempts (user_id, quiz_id, score, answers_json)
        VALUES (1, ?, 100, '[]')
    `).run(quizId);
    const guideId = Number(context.database.prepare(`
        INSERT INTO generated_study_guides (user_id, course_id, generated_content)
        VALUES (1, 1, 'guide')
    `).run().lastInsertRowid);
    context.database.prepare(`
        INSERT INTO study_guide_materials (study_guide_id, material_id) VALUES (?, ?)
    `).run(guideId, materialId);
    const flashcardId = Number(context.database.prepare(`
        INSERT INTO flashcards (user_id, course_id, front, back)
        VALUES (1, 1, 'front', 'back')
    `).run().lastInsertRowid);
    context.database.prepare(`
        INSERT INTO flashcard_materials (flashcard_id, material_id) VALUES (?, ?)
    `).run(flashcardId, materialId);

    await request(context.app)
        .delete("/api/courses/1")
        .expect(204);

    assert.equal(fs.existsSync(storedPath), false);
    for (const table of [
        "courses", "units", "materials", "generated_study_guides",
        "study_guide_materials", "generated_quizzes", "quiz_materials",
        "quiz_attempts", "flashcards", "flashcard_materials"
    ]) {
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
    }
});

test("course deletion leaves database records intact when storage cleanup fails", async t => {
    const context = createTestApp({
        fileStorage: {
            driver: "test",
            ensureReady() {},
            createUploadMiddleware() {
                return { single() { return (req, res, next) => next(); } };
            },
            async remove() { throw new Error("Storage unavailable"); },
            async healthCheck() { return true; }
        }
    });
    t.after(context.cleanup);
    context.database.prepare(`
        INSERT INTO materials (
            course_id, unit_id, original_filename, stored_filename,
            material_type, extracted_text, upload_status
        ) VALUES (1, 1, 'keep.txt', 'keep.txt', 'notes', '', 'ready')
    `).run();

    const response = await request(context.app).delete("/api/courses/1").expect(503);
    assert.equal(response.body.error.code, "COURSE_STORAGE_CLEANUP_FAILED");
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM courses WHERE id = 1").get().count,
        1
    );
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials WHERE course_id = 1").get().count,
        1
    );
});
