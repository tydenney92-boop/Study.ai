const test = require("node:test");
const assert = require("node:assert/strict");
const { authenticatedRequest: request } = require("./helpers/test-app");
const { createTestApp } = require("./helpers/test-app");

async function createCourse(app, code = "CHEM 101") {
    const response = await request(app)
        .post("/api/courses")
        .send({
            courseName: "Chemistry",
            courseCode: code,
            semester: "Fall 2026"
        })
        .expect(201);
    return response.body;
}

test("units can be created, listed, retrieved, updated, and deleted", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app);

    const created = await request(context.app)
        .post(`/api/courses/${course.id}/units`)
        .send({ name: "Atomic Structure", unitNumber: 1 })
        .expect(201);

    assert.equal(created.body.courseId, course.id);
    assert.equal(created.body.unitNumber, 1);

    const listed = await request(context.app)
        .get(`/api/courses/${course.id}/units`)
        .expect(200);

    assert.deepEqual(listed.body.map(unit => unit.id), [created.body.id]);

    await request(context.app)
        .get(`/api/courses/${course.id}/units/${created.body.id}`)
        .expect(200);

    const updated = await request(context.app)
        .patch(`/api/courses/${course.id}/units/${created.body.id}`)
        .send({ name: "Atoms and Elements", unitNumber: 2 })
        .expect(200);

    assert.equal(updated.body.name, "Atoms and Elements");
    assert.equal(updated.body.unitNumber, 2);

    await request(context.app)
        .delete(`/api/courses/${course.id}/units/${created.body.id}`)
        .expect(204);

    await request(context.app)
        .get(`/api/courses/${course.id}/units/${created.body.id}`)
        .expect(404);
});

test("new units append automatically when unitNumber is omitted", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app, "AUTO 101");
    const first = await request(context.app).post(`/api/courses/${course.id}/units`)
        .send({ name: "First" }).expect(201);
    const second = await request(context.app).post(`/api/courses/${course.id}/units`)
        .send({ name: "Second" }).expect(201);
    assert.deepEqual([first.body.unitNumber, second.body.unitNumber], [1, 2]);
});

test("unit routes enforce course ownership and course-unit relationships", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const firstCourse = await createCourse(context.app, "CHEM 101");
    const secondCourse = await createCourse(context.app, "PHYS 101");

    const unit = await request(context.app)
        .post(`/api/courses/${firstCourse.id}/units`)
        .send({ name: "Unit One", unitNumber: 1 })
        .expect(201);

    await request(context.app)
        .get(`/api/courses/${secondCourse.id}/units/${unit.body.id}`)
        .expect(404);

    await request(context.app)
        .patch(`/api/courses/${secondCourse.id}/units/${unit.body.id}`)
        .send({ name: "Wrong course" })
        .expect(404);

    await request(context.app)
        .post(`/api/courses/${firstCourse.id}/units`)
        .send({ name: "Duplicate number", unitNumber: 1 })
        .expect(409);

    await request(context.app)
        .post(`/api/courses/${firstCourse.id}/units`)
        .send({ name: "Invalid number", unitNumber: 0 })
        .expect(400);
});

test("units reorder atomically and deletion preserves materials as unassigned", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app, "ORDER 101");
    const units = [];
    for (const number of [1, 2, 3]) {
        const response = await request(context.app)
            .post(`/api/courses/${course.id}/units`)
            .send({ name: `Unit ${number}`, unitNumber: number })
            .expect(201);
        units.push(response.body);
    }
    const materialId = Number(context.database.prepare(`
        INSERT INTO materials (
            course_id, unit_id, display_name, original_filename,
            stored_filename, material_type, extracted_text, upload_status
        ) VALUES (?, ?, 'Movable notes', 'notes.txt', 'notes.txt', 'notes', '', 'ready')
    `).run(course.id, units[1].id).lastInsertRowid);

    const reordered = await request(context.app)
        .put(`/api/courses/${course.id}/units/order`)
        .send({ unitIds: [units[2].id, units[0].id, units[1].id] })
        .expect(200);
    assert.deepEqual(reordered.body.map(unit => unit.id), [
        units[2].id, units[0].id, units[1].id
    ]);
    assert.deepEqual(reordered.body.map(unit => unit.unitNumber), [1, 2, 3]);

    await request(context.app)
        .put(`/api/courses/${course.id}/units/order`)
        .send({ unitIds: [units[0].id, units[1].id] })
        .expect(400);
    const unchanged = await request(context.app)
        .get(`/api/courses/${course.id}/units`)
        .expect(200);
    assert.deepEqual(unchanged.body.map(unit => unit.id), [
        units[2].id, units[0].id, units[1].id
    ]);

    await request(context.app)
        .delete(`/api/courses/${course.id}/units/${units[1].id}`)
        .expect(204);
    assert.equal(
        context.database.prepare("SELECT unit_id AS unitId FROM materials WHERE id = ?")
            .get(materialId).unitId,
        null
    );
    const remaining = await request(context.app)
        .get(`/api/courses/${course.id}/units`)
        .expect(200);
    assert.deepEqual(remaining.body.map(unit => unit.unitNumber), [1, 2]);
});
