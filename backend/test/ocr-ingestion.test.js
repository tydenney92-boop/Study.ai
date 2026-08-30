const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authenticatedRequest: request, createTestApp } = require("./helpers/test-app");
const { JPEG_FIXTURE, PNG_FIXTURE } = require("./helpers/image-fixtures");

function fakeOcrProvider(handler) {
    const calls = [];
    return {
        enabled: true,
        provider: "fake",
        calls,
        async extractTextFromImage(input) {
            calls.push({ mimeType: input.mimeType, filename: input.filename });
            return handler ? handler(input) :
                "Supply and demand interact to determine equilibrium price and quantity.";
        }
    };
}

test("PNG and JPEG OCR uploads persist text, chunks, retrieval, and original files", async t => {
    const provider = fakeOcrProvider(input => input.filename.endsWith(".png")
        ? "Typed screenshot notes explain opportunity cost and marginal decisions."
        : "Handwritten notes explain supply, demand, and equilibrium clearly.");
    const context = createTestApp({
        config: { ocrEnabled: true },
        ocrProvider: provider,
        ocrOutput: { log() {} }
    });
    t.after(context.cleanup);

    const png = await request(context.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "typed-notes.png", contentType: "image/png" })
        .expect(201);
    const jpeg = await request(context.app).post("/api/courses/1/materials")
        .attach("file", JPEG_FIXTURE, { filename: "handwritten-notes.jpeg", contentType: "image/jpeg" })
        .expect(201);

    for (const uploaded of [png.body, jpeg.body]) {
        assert.equal(uploaded.materialType, "image");
        assert.equal(uploaded.extractionStatus, "extracted");
        assert.equal(uploaded.extractionMethod, "ocr");
        assert.ok(context.database.prepare(
            "SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?"
        ).get(uploaded.id).count > 0);
        assert.equal(fs.existsSync(path.join(
            context.temporaryDirectory, "uploads", uploaded.storedFilename
        )), true);
    }
    assert.deepEqual(provider.calls.map(call => call.mimeType), ["image/png", "image/jpeg"]);
    const searched = await request(context.app)
        .get("/api/courses/1/materials?search=opportunity")
        .expect(200);
    assert.deepEqual(searched.body.map(material => material.id), [png.body.id]);
    const retrieved = await context.app.locals.retrievalService.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [jpeg.body.id],
        query: "equilibrium supply demand",
        limit: 3
    });
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].materialId, jpeg.body.id);
    await request(context.app).get(`/api/courses/1/materials/${jpeg.body.id}`).expect(200);
    assert.equal(provider.calls.length, 2);

    await request(context.app).delete(`/api/courses/1/materials/${png.body.id}`).expect(204);
    assert.equal(fs.existsSync(path.join(
        context.temporaryDirectory, "uploads", png.body.storedFilename
    )), false);
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?"
    ).get(png.body.id).count, 0);
});

test("invalid images are rejected before storage or OCR", async t => {
    const provider = fakeOcrProvider();
    const context = createTestApp({ config: { ocrEnabled: true }, ocrProvider: provider });
    t.after(context.cleanup);
    const response = await request(context.app).post("/api/courses/1/materials")
        .attach("file", Buffer.from("not an image"), {
            filename: "fake.png",
            contentType: "image/png"
        }).expect(415);
    assert.equal(response.body.error.code, "FILE_CONTENT_TYPE_INVALID");
    const mismatched = await request(context.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "fake.png", contentType: "image/jpeg" })
        .expect(415);
    assert.equal(mismatched.body.error.code, "FILE_CONTENT_TYPE_INVALID");
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(context.temporaryDirectory, "uploads")), []);
});

test("OCR disabled, unreadable, and provider failure states remain honest", async t => {
    const disabled = createTestApp();
    t.after(disabled.cleanup);
    const unavailable = await request(disabled.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "disabled.png", contentType: "image/png" })
        .expect(201);
    assert.equal(unavailable.body.extractionStatus, "unsupported");
    assert.equal(unavailable.body.extractionMethod, null);
    assert.match(unavailable.body.extractionError, /not enabled/);

    const unreadableProvider = fakeOcrProvider(() => "[unreadable]");
    const unreadable = createTestApp({
        config: { ocrEnabled: true },
        ocrProvider: unreadableProvider,
        ocrOutput: { log() {} }
    });
    t.after(unreadable.cleanup);
    const noText = await request(unreadable.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "unreadable.png", contentType: "image/png" })
        .expect(201);
    assert.equal(noText.body.extractionStatus, "no_text");
    assert.equal(noText.body.extractionMethod, "ocr");

    const failed = createTestApp({
        config: { ocrEnabled: true },
        ocrProvider: fakeOcrProvider(() => { throw new Error("private provider failure"); }),
        ocrOutput: { log() {} }
    });
    t.after(failed.cleanup);
    const failure = await request(failed.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "failure.png", contentType: "image/png" })
        .expect(201);
    assert.equal(failure.body.extractionStatus, "failed");
    assert.equal(failure.body.extractionMethod, "ocr");
    assert.equal(contextlessProviderDetails(failure.body.extractionError), false);
});

function contextlessProviderDetails(message) {
    return /private provider failure/.test(message);
}

test("OCR image byte limits prevent provider usage", async t => {
    const provider = fakeOcrProvider();
    const context = createTestApp({
        config: { ocrEnabled: true, ocrMaxImageBytes: 16 },
        ocrProvider: provider,
        ocrOutput: { log() {} }
    });
    t.after(context.cleanup);
    const result = await request(context.app).post("/api/courses/1/materials")
        .attach("file", PNG_FIXTURE, { filename: "large.png", contentType: "image/png" })
        .expect(201);
    assert.equal(result.body.extractionStatus, "failed");
    assert.match(result.body.extractionError, /size limit/);
    assert.equal(provider.calls.length, 0);
});
