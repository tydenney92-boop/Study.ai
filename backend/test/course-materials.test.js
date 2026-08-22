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
    assert.equal(uploaded.body.displayName, "My Lecture Notes.txt");
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
    assert.equal(retrieved.body.extractedText, "Lecture notes");
    assert.equal(retrieved.body.extractionStatus, "no_text");

    const text = await request(context.app)
        .get(`/api/courses/${course.id}/materials/${uploaded.body.id}/text`)
        .expect(200);
    assert.deepEqual(text.body, {
        id: uploaded.body.id,
        courseId: course.id,
        originalFilename: "My Lecture Notes.txt",
        extractedText: "Lecture notes",
        extractionStatus: "no_text",
        extractionError: "This material does not contain enough extractable text."
    });
});

test("materials can be renamed, moved, searched by text, and securely downloaded", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app, "MANAGE 101");
    const firstUnit = await createUnit(context.app, course.id, 1);
    const secondUnit = await createUnit(context.app, course.id, 2);
    const uploaded = await request(context.app)
        .post(`/api/courses/${course.id}/materials`)
        .field("unitId", String(firstUnit.id))
        .attach("file", Buffer.from("Mitochondria produce cellular energy for this lecture."), {
            filename: "week-1.txt",
            contentType: "text/plain"
        })
        .expect(201);

    const updated = await request(context.app)
        .patch(`/api/courses/${course.id}/materials/${uploaded.body.id}`)
        .send({ displayName: "Cell Energy Review", unitId: secondUnit.id })
        .expect(200);
    assert.equal(updated.body.displayName, "Cell Energy Review");
    assert.equal(updated.body.originalFilename, "week-1.txt");
    assert.equal(updated.body.unitId, secondUnit.id);

    const textSearch = await request(context.app)
        .get(`/api/courses/${course.id}/materials?search=mitochondria`)
        .expect(200);
    assert.deepEqual(textSearch.body.map(material => material.id), [uploaded.body.id]);
    const nameSearch = await request(context.app)
        .get(`/api/courses/${course.id}/materials?search=Energy%20Review`)
        .expect(200);
    assert.equal(nameSearch.body[0].displayName, "Cell Energy Review");

    const inline = await request(context.app)
        .get(`/api/courses/${course.id}/materials/${uploaded.body.id}/file`)
        .expect(200);
    assert.match(inline.headers["content-disposition"], /^inline;/);
    assert.equal(inline.headers["cache-control"], "private, no-store");
    assert.equal(inline.text, "Mitochondria produce cellular energy for this lecture.");

    const download = await request(context.app)
        .get(`/api/courses/${course.id}/materials/${uploaded.body.id}/file?download=1`)
        .expect(200);
    assert.match(download.headers["content-disposition"], /^attachment;/);

    await request(context.app)
        .patch(`/api/courses/${course.id}/materials/${uploaded.body.id}`)
        .send({ unitId: null })
        .expect(200)
        .expect(response => assert.equal(response.body.unitId, null));
});

test("material management and file access enforce course and user ownership", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const course = await createCourse(context.app, "OWNER 101");
    const wrongCourse = await createCourse(context.app, "OWNER 102");
    const wrongUnit = await createUnit(context.app, wrongCourse.id, 1);
    const uploaded = await request(context.app)
        .post(`/api/courses/${course.id}/materials`)
        .attach("file", Buffer.from("owned material content"), "owned.txt")
        .expect(201);

    await request(context.app)
        .patch(`/api/courses/${course.id}/materials/${uploaded.body.id}`)
        .send({ unitId: wrongUnit.id })
        .expect(404);
    await request(context.app)
        .patch(`/api/courses/${wrongCourse.id}/materials/${uploaded.body.id}`)
        .send({ displayName: "Stolen" })
        .expect(404);
    await request(context.app)
        .get(`/api/courses/${wrongCourse.id}/materials/${uploaded.body.id}/file`)
        .expect(404);
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
    const privateMaterialId = Number(context.database.prepare(`
        INSERT INTO materials (
            course_id, original_filename, stored_filename, material_type,
            extracted_text, upload_status
        ) VALUES (?, 'private.txt', 'private-owner.txt', 'notes', '', 'ready')
    `).run(privateCourseId).lastInsertRowid);

    await request(context.app)
        .get(`/api/courses/${privateCourseId}/materials`)
        .expect(404);
    await request(context.app)
        .patch(`/api/courses/${privateCourseId}/materials/${privateMaterialId}`)
        .send({ displayName: "Not mine" })
        .expect(404);
    await request(context.app)
        .get(`/api/courses/${privateCourseId}/materials/${privateMaterialId}/file`)
        .expect(404);
    await request(context.app)
        .delete(`/api/courses/${privateCourseId}/materials/${privateMaterialId}`)
        .expect(404);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials WHERE id = ?")
            .get(privateMaterialId).count,
        1
    );

    const filesBeforeRejectedUpload = uploadFiles(context);

    await request(context.app)
        .post(`/api/courses/${privateCourseId}/materials`)
        .attach("file", Buffer.from("private"), "private.txt")
        .expect(404);

    assert.deepEqual(uploadFiles(context), filesBeforeRejectedUpload);
});

test("material deletion is ownership scoped and removes its stored file and relationships", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const ownerCourse = await createCourse(context.app, "DELETE 101");
    const wrongCourse = await createCourse(context.app, "DELETE 102");
    const uploaded = await request(context.app)
        .post(`/api/courses/${ownerCourse.id}/materials`)
        .attach("file", Buffer.from("delete me"), "delete-me.txt")
        .expect(201);
    const storedPath = path.join(
        context.temporaryDirectory,
        "uploads",
        uploaded.body.storedFilename
    );
    assert.equal(fs.existsSync(storedPath), true);
    const retrievable = await request(context.app)
        .get(`/api/courses/${ownerCourse.id}/materials/${uploaded.body.id}`)
        .expect(200);
    assert.equal(retrievable.body.courseId, ownerCourse.id);
    assert.equal(retrievable.body.id, uploaded.body.id);
    const guideId = Number(context.database.prepare(`
        INSERT INTO generated_study_guides (user_id, course_id, generated_content)
        VALUES (1, ?, 'historical guide')
    `).run(ownerCourse.id).lastInsertRowid);
    context.database.prepare(`
        INSERT INTO study_guide_materials (study_guide_id, material_id) VALUES (?, ?)
    `).run(guideId, uploaded.body.id);

    await request(context.app)
        .delete(`/api/courses/${wrongCourse.id}/materials/${uploaded.body.id}`)
        .expect(404);
    assert.equal(fs.existsSync(storedPath), true);

    await request(context.app)
        .delete(`/api/courses/${ownerCourse.id}/materials/${uploaded.body.id}`)
        .expect(204);
    assert.equal(fs.existsSync(storedPath), false);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials WHERE id = ?")
            .get(uploaded.body.id).count,
        0
    );
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM study_guide_materials WHERE material_id = ?")
            .get(uploaded.body.id).count,
        0
    );
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM generated_study_guides WHERE id = ?")
            .get(guideId).count,
        1
    );
});

test("material deletion keeps its database row when stored-file cleanup fails", async t => {
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
    const materialId = Number(context.database.prepare(`
        INSERT INTO materials (
            course_id, unit_id, original_filename, stored_filename,
            material_type, extracted_text, upload_status
        ) VALUES (1, 1, 'keep.txt', 'keep.txt', 'notes', '', 'ready')
    `).run().lastInsertRowid);

    const response = await request(context.app)
        .delete(`/api/courses/1/materials/${materialId}`)
        .expect(503);
    assert.equal(response.body.error.code, "MATERIAL_STORAGE_CLEANUP_FAILED");
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials WHERE id = ?")
            .get(materialId).count,
        1
    );
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
    assert.equal(detail.body.text_content, "legacy notes");
    assert.equal(detail.body.extraction_status, "no_text");
    assert.equal(detail.body.original_name, "Legacy Notes.txt");
});
