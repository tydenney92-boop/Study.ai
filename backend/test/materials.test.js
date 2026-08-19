const test = require("node:test");
const assert = require("node:assert/strict");
const { authenticatedRequest: request } = require("./helpers/test-app");
const {
    createTestApp,
    insertMaterial
} = require("./helpers/test-app");

test("materials can be listed and retrieved with the legacy response shape", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const listResponse = await request(context.app)
        .get("/api/materials")
        .expect(200);

    assert.equal(listResponse.body.length, 1);
    assert.equal(listResponse.body[0].id, materialId);
    assert.equal(listResponse.body[0].name, "Test notes.txt");
    assert.equal(listResponse.body[0].unit, "unit1");

    const detailResponse = await request(context.app)
        .get(`/api/materials/${materialId}`)
        .expect(200);

    assert.equal(
        detailResponse.body.text_content,
        "Supply and demand test content."
    );
});

test("a non-PDF material upload is stored without changing upload behavior", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const response = await request(context.app)
        .post("/api/materials")
        .field("unit", "unit2")
        .attach("file", Buffer.from("Lecture notes with enough readable text for studying."), {
            filename: "lecture.txt",
            contentType: "text/plain"
        })
        .expect(200);

    assert.equal(response.body.material.name, "lecture.txt");
    assert.equal(response.body.material.type, "notes");
    assert.equal(response.body.material.unit, "unit2");

    const stored = context.database
        .prepare("SELECT * FROM materials WHERE id = ?")
        .get(response.body.material.id);

    assert.equal(stored.original_filename, "lecture.txt");
    assert.equal(stored.extracted_text, "Lecture notes with enough readable text for studying.");
    assert.equal(stored.extraction_status, "extracted");
    assert.equal(stored.course_id, 1);
});

test("legacy DOC and PPT uploads are rejected as unsupported without storage", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    for (const filename of ["legacy.doc", "legacy.ppt"]) {
        const response = await request(context.app)
            .post("/api/courses/1/materials")
            .attach("file", Buffer.from("legacy binary file"), {
                filename,
                contentType: "application/octet-stream"
            })
            .expect(415);
        assert.equal(response.body.error.code, "FILE_TYPE_NOT_ALLOWED");
        assert.match(response.body.error.message, /Legacy DOC and PPT/);
    }

    assert.deepEqual(
        require("fs").readdirSync(`${context.temporaryDirectory}/uploads`),
        []
    );
});
