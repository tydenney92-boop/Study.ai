const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { authenticatedRequest: request } = require("./helpers/test-app");
const { createTestApp } = require("./helpers/test-app");

async function createCourse(app, code) {
    const response = await request(app)
        .post("/api/courses")
        .send({
            courseName: code,
            courseCode: code,
            semester: "Fall 2026"
        })
        .expect(201);
    return response.body;
}

async function createUnit(app, courseId, unitNumber = 1) {
    const response = await request(app)
        .post(`/api/courses/${courseId}/units`)
        .send({ name: `Unit ${unitNumber}`, unitNumber })
        .expect(201);
    return response.body;
}

function uploadFiles(context) {
    const directory = path.join(context.temporaryDirectory, "uploads");
    return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
}

test("course-aware materials can be uploaded, listed, retrieved, and read", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app, "HIST 101");
    const unit = await createUnit(context.app, course.id);

    const uploaded = await request(context.app)
        .post(`/api/courses/${course.id}/materials`)
        .field("unitId", String(unit.id))
        .attach("file", Buffer.from("Lecture notes"), {
            filename: "My Lecture Notes.txt",
            contentType: "text/plain"
        })
        .expect(201);

    assert.equal(uploaded.body.courseId, course.id);
    assert.equal(uploaded.body.unitId, unit.id);
    assert.equal(uploaded.body.originalFilename, "My Lecture Notes.txt");
    assert.equal(uploaded.body.materialType, "notes");
    assert.match(uploaded.body.storedFilename, /^[0-9a-f-]{36}\.txt$/);
    assert.notEqual(uploaded.body.storedFilename, uploaded.body.originalFilename);

    const listed = await request(context.app)
        .get(`/api/courses/${course.id}/materials`)
        .expect(200);
    assert.equal(listed.body.length, 1);

    const retrieved = await request(context.app)
        .get(`/api/courses/${course.id}/materials/${uploaded.body.id}`)
        .expect(200);
    assert.equal(retrieved.body.extractedText, "");

    const text = await request(context.app)
        .get(`/api/courses/${course.id}/materials/${uploaded.body.id}/text`)
        .expect(200);
    assert.deepEqual(text.body, {
        id: uploaded.body.id,
        courseId: course.id,
        originalFilename: "My Lecture Notes.txt",
        extractedText: ""
    });
});

test("material access is rejected across courses and users", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const firstCourse = await createCourse(context.app, "ART 101");
    const secondCourse = await createCourse(context.app, "ART 102");

    const uploaded = await request(context.app)
        .post(`/api/courses/${firstCourse.id}/materials`)
        .attach("file", Buffer.from("notes"), "art.txt")
        .expect(201);

    await request(context.app)
        .get(`/api/courses/${secondCourse.id}/materials/${uploaded.body.id}`)
        .expect(404);

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other User', 'owner@example.com')
    `).run().lastInsertRowid);
    const privateCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private', 'PRIVATE', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);

    await request(context.app)
        .get(`/api/courses/${privateCourseId}/materials`)
        .expect(404);

    const filesBeforeRejectedUpload = uploadFiles(context);

    await request(context.app)
        .post(`/api/courses/${privateCourseId}/materials`)
        .attach("file", Buffer.from("private"), "private.txt")
        .expect(404);

    assert.deepEqual(uploadFiles(context), filesBeforeRejectedUpload);
});

test("a unit from another course is rejected and its upload is cleaned up", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const firstCourse = await createCourse(context.app, "MATH 101");
    const secondCourse = await createCourse(context.app, "MATH 102");
    const wrongUnit = await createUnit(context.app, firstCourse.id);

    const response = await request(context.app)
        .post(`/api/courses/${secondCourse.id}/materials`)
        .field("unitId", String(wrongUnit.id))
        .attach("file", Buffer.from("notes"), "wrong-unit.txt")
        .expect(404);

    assert.equal(response.body.error.code, "UNIT_NOT_FOUND");
    assert.deepEqual(uploadFiles(context), []);
});

test("failed extraction removes the uploaded file", async t => {
    const context = createTestApp({
        textExtractionService: {
            async extract() {
                throw new Error("Simulated extraction failure");
            }
        }
    });
    t.after(context.cleanup);

    await request(context.app)
        .post("/api/courses/1/materials")
        .field("unitId", "1")
        .attach("file", Buffer.from("not actually a PDF"), "broken.pdf")
        .expect(500);

    assert.deepEqual(uploadFiles(context), []);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials").get().count,
        0
    );
});

test("failed database insertion removes the uploaded file", async t => {
    const context = createTestApp({
        extendRepositories(repositories) {
            return {
                materials: {
                    ...repositories.materials,
                    create() {
                        throw new Error("Simulated database failure");
                    }
                }
            };
        }
    });
    t.after(context.cleanup);

    await request(context.app)
        .post("/api/courses/1/materials")
        .field("unitId", "1")
        .attach("file", Buffer.from("notes"), "database-failure.txt")
        .expect(500);

    assert.deepEqual(uploadFiles(context), []);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials").get().count,
        0
    );
});

test("unsupported and oversized files are rejected without leftovers", async t => {
    const context = createTestApp({
        config: { maxUploadBytes: 10 }
    });
    t.after(context.cleanup);

    const invalidType = await request(context.app)
        .post("/api/courses/1/materials")
        .attach("file", Buffer.from("bad"), "malware.exe")
        .expect(415);
    assert.equal(invalidType.body.error.code, "FILE_TYPE_NOT_ALLOWED");

    const tooLarge = await request(context.app)
        .post("/api/courses/1/materials")
        .attach("file", Buffer.from("more than ten bytes"), "large.txt")
        .expect(413);
    assert.equal(tooLarge.body.error.code, "FILE_TOO_LARGE");

    assert.deepEqual(uploadFiles(context), []);
});

test("legacy material routes retain their frontend response contract", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const uploaded = await request(context.app)
        .post("/api/materials")
        .field("unit", "unit2")
        .attach("file", Buffer.from("legacy notes"), "Legacy Notes.txt")
        .expect(200);

    assert.deepEqual(uploaded.body.material, {
        id: uploaded.body.material.id,
        name: "Legacy Notes.txt",
        type: "notes",
        unit: "unit2"
    });

    const listed = await request(context.app)
        .get("/api/materials")
        .expect(200);
    assert.equal(listed.body[0].name, "Legacy Notes.txt");
    assert.equal(listed.body[0].unit, "unit2");
    assert.match(listed.body[0].filename, /^[0-9a-f-]{36}\.txt$/);

    const detail = await request(context.app)
        .get(`/api/materials/${uploaded.body.material.id}`)
        .expect(200);
    assert.equal(detail.body.text_content, "");
    assert.equal(detail.body.original_name, "Legacy Notes.txt");
});
