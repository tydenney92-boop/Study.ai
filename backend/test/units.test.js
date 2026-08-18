const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
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
