const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
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

test("a course with stored materials cannot be deleted accidentally", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    context.database.prepare(`
        INSERT INTO materials (
            course_id, unit_id, original_filename, stored_filename,
            material_type, extracted_text, upload_status
        ) VALUES (1, 1, 'keep.txt', 'keep.txt', 'notes', '', 'ready')
    `).run();

    const response = await request(context.app)
        .delete("/api/courses/1")
        .expect(409);

    assert.equal(response.body.error.code, "COURSE_HAS_MATERIALS");
});
