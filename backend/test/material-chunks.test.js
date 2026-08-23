const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createTestApp,
    authenticatedRequest: request,
    insertMaterial
} = require("./helpers/test-app");
const { createDocumentChunker } = require("../src/services/document-chunking.service");

async function uploadText(app, courseId, filename, text) {
    return request(app)
        .post(`/api/courses/${courseId}/materials`)
        .attach("file", Buffer.from(text), {
            filename,
            contentType: "text/plain"
        })
        .expect(201);
}

test("successful uploads create persisted, ordered chunks with deterministic counts", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const paragraphs = Array.from({ length: 35 }, (_, index) =>
        `Section ${index + 1}. Market concept ${index + 1} explains a distinct relationship between buyers and sellers in this course.`
    );
    const uploaded = await uploadText(
        context.app,
        1,
        "long-market-notes.txt",
        paragraphs.join("\n\n")
    );
    const chunks = context.database.prepare(`
        SELECT chunk_index AS chunkIndex, chunk_text AS text,
               character_count AS characterCount,
               token_estimate AS tokenEstimate
        FROM material_chunks WHERE material_id = ? ORDER BY chunk_index
    `).all(uploaded.body.id);

    assert.ok(chunks.length > 1);
    assert.deepEqual(chunks.map(chunk => chunk.chunkIndex),
        chunks.map((_, index) => index));
    chunks.forEach(chunk => {
        assert.equal(chunk.characterCount, chunk.text.length);
        assert.equal(chunk.tokenEstimate, Math.ceil(chunk.text.length / 4));
        assert.ok(chunk.text.length <= 2400);
    });
    assert.match(chunks[0].text, /Section 1\./);
    assert.match(chunks.at(-1).text, /Section 35\./);
});

test("chunking prefers paragraph and sentence boundaries with whole-unit overlap", () => {
    const chunker = createDocumentChunker({
        targetCharacters: 70,
        maxCharacters: 160,
        overlapCharacters: 30,
        minimumCharacters: 20
    });
    const chunks = chunker.chunk([
        "Alpha starts here. Alpha closing sentence.",
        "Beta starts here. Beta closing sentence.",
        "Gamma starts here. Gamma closing sentence."
    ].join("\n\n"));

    assert.equal(chunks.length, 3);
    assert.match(chunks[0].text, /^Alpha starts here\./);
    assert.match(chunks[1].text, /^Alpha closing sentence\.\n\nBeta starts here\./);
    assert.match(chunks[2].text, /^Beta closing sentence\.\n\nGamma starts here\./);
    assert.deepEqual(chunks.map(chunk => chunk.chunkIndex), [0, 1, 2]);

    const withoutBoilerplate = chunker.chunk([
        "Repeated Header\nFirst page has meaningful material text.\nRepeated Footer",
        "Repeated Header\nSecond page has meaningful material text.\nRepeated Footer",
        "Repeated Header\nThird page has meaningful material text.\nRepeated Footer"
    ].join("\f"));
    assert.doesNotMatch(withoutBoilerplate.map(chunk => chunk.text).join("\n"),
        /Repeated Header|Repeated Footer/);
});

test("chunking safely splits oversized paragraphs and preserves short documents", () => {
    const chunker = createDocumentChunker({
        targetCharacters: 100,
        maxCharacters: 140,
        overlapCharacters: 20,
        minimumCharacters: 30
    });
    const oversizedParagraph = Array.from(
        { length: 80 },
        (_, index) => `concept${index + 1}`
    ).join(" ");
    const oversizedChunks = chunker.chunk(oversizedParagraph);

    assert.ok(oversizedChunks.length > 1);
    assert.deepEqual(
        oversizedChunks.map(chunk => chunk.chunkIndex),
        oversizedChunks.map((_, index) => index)
    );
    oversizedChunks.forEach(chunk => {
        assert.ok(chunk.text.length > 0);
        assert.ok(chunk.text.length <= 140);
    });
    assert.match(oversizedChunks[0].text, /^concept1\b/);
    assert.match(oversizedChunks.at(-1).text, /\bconcept80$/);

    const shortText = "Scarcity requires choices between competing uses of limited resources.";
    const shortChunks = chunker.chunk(shortText);
    assert.equal(shortChunks.length, 1);
    assert.equal(shortChunks[0].text, shortText);
    assert.equal(shortChunks[0].characterCount, shortText.length);
});

test("startup-style stale rebuild indexes existing extracted materials idempotently", t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database, {
        originalFilename: "preexisting.txt",
        storedFilename: "preexisting.txt",
        extractedText: "Preexisting extracted material explains marginal analysis clearly."
    });
    assert.equal(context.database.prepare(`
        SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?
    `).get(materialId).count, 0);

    const first = context.app.locals.materialIndexingService.rebuildStale()
        .find(result => result.materialId === materialId);
    const second = context.app.locals.materialIndexingService.rebuildStale()
        .find(result => result.materialId === materialId);
    assert.equal(first.rebuilt, true);
    assert.equal(second.rebuilt, false);
    assert.ok(context.database.prepare(`
        SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?
    `).get(materialId).count > 0);
});

test("empty and non-extracted materials produce no chunks", t => {
    const context = createTestApp();
    t.after(context.cleanup);
    for (const [index, extractionStatus] of ["no_text", "unsupported", "failed"].entries()) {
        const materialId = insertMaterial(context.database, {
            originalFilename: `${extractionStatus}.txt`,
            storedFilename: `${extractionStatus}-${index}.txt`,
            extractedText: extractionStatus === "failed" ? "Stale unusable text." : "",
            extractionStatus
        });
        context.app.locals.materialIndexingService.rebuildMaterial({
            id: materialId,
            courseId: 1,
            extractedText: extractionStatus === "failed" ? "Stale unusable text." : "",
            extractionStatus
        });
        assert.equal(context.database.prepare(`
            SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?
        `).get(materialId).count, 0);
    }
});

test("material indexes rebuild atomically when extracted text changes", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const uploaded = await uploadText(
        context.app,
        1,
        "rebuild.txt",
        "Original material about scarcity and choices with enough text to extract."
    );
    const before = context.database.prepare(`
        SELECT id, content_hash AS contentHash FROM material_chunks
        WHERE material_id = ? ORDER BY chunk_index
    `).all(uploaded.body.id);
    const replacement = "Replacement material explains comparative advantage and trade in detail.";
    context.database.prepare("UPDATE materials SET extracted_text = ? WHERE id = ?")
        .run(replacement, uploaded.body.id);

    const rebuilt = context.app.locals.materialIndexingService.rebuildMaterial({
        id: uploaded.body.id,
        courseId: 1,
        extractedText: replacement,
        extractionStatus: "extracted"
    });
    assert.equal(rebuilt.rebuilt, true);
    const after = context.database.prepare(`
        SELECT id, chunk_text AS text, content_hash AS contentHash
        FROM material_chunks WHERE material_id = ? ORDER BY chunk_index
    `).all(uploaded.body.id);
    assert.notEqual(after[0].contentHash, before[0].contentHash);
    assert.match(after[0].text, /comparative advantage/);

    const unchanged = context.app.locals.materialIndexingService.rebuildMaterial({
        id: uploaded.body.id,
        courseId: 1,
        extractedText: replacement,
        extractionStatus: "extracted"
    });
    assert.equal(unchanged.rebuilt, false);
    assert.deepEqual(
        context.database.prepare(`
            SELECT id FROM material_chunks WHERE material_id = ? ORDER BY chunk_index
        `).all(uploaded.body.id),
        after.map(chunk => ({ id: chunk.id }))
    );
});

test("material and course deletion cascade their chunks", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const first = await uploadText(
        context.app,
        1,
        "delete-material.txt",
        "Material deletion should cascade indexed text about consumer demand."
    );
    await request(context.app)
        .delete(`/api/courses/1/materials/${first.body.id}`)
        .expect(204);
    assert.equal(context.database.prepare(`
        SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?
    `).get(first.body.id).count, 0);

    const course = await request(context.app).post("/api/courses").send({
        courseName: "Chunk Lifecycle",
        courseCode: "CHUNK 201",
        semester: "Fall"
    }).expect(201);
    const second = await uploadText(
        context.app,
        course.body.id,
        "delete-course.txt",
        "Course deletion should cascade indexed text about producer supply."
    );
    await request(context.app).delete(`/api/courses/${course.body.id}`).expect(204);
    assert.equal(context.database.prepare(`
        SELECT COUNT(*) AS count FROM material_chunks WHERE material_id = ?
    `).get(second.body.id).count, 0);
});

test("lexical retrieval ranks relevant chunks across materials and respects limits", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const biology = await uploadText(
        context.app,
        1,
        "biology.txt",
        "Photosynthesis uses chlorophyll to capture light energy. Chlorophyll is central to photosynthesis."
    );
    const economics = await uploadText(
        context.app,
        1,
        "economics.txt",
        "Inflation describes a sustained increase in the general price level. Monetary policy can affect inflation."
    );
    const retrieval = context.app.locals.retrievalService;

    const ranked = retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [economics.body.id, biology.body.id],
        query: "How does chlorophyll support photosynthesis?",
        limit: 5
    });
    assert.ok(ranked.length >= 1);
    assert.equal(ranked[0].materialId, biology.body.id);
    assert.equal(ranked[0].materialName, "biology.txt");
    assert.ok(ranked[0].score > 0);

    const normalizedQuery = retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [economics.body.id, biology.body.id],
        query: "CHLÓROPHYLL!!! photosynthesis???",
        limit: 5
    });
    assert.equal(normalizedQuery[0].materialId, biology.body.id);

    const limited = retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [biology.body.id, economics.body.id],
        query: "photosynthesis inflation",
        limit: 1
    });
    assert.equal(limited.length, 1);
    const both = retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [biology.body.id, economics.body.id],
        query: "photosynthesis inflation",
        limit: 5
    });
    assert.deepEqual(new Set(both.map(chunk => chunk.materialId)),
        new Set([biology.body.id, economics.body.id]));
    assert.deepEqual(retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [biology.body.id, economics.body.id],
        query: "igneous volcanology magma",
        limit: 5
    }), []);
});

test("retrieval enforces owned course and allowed-material scope", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const own = await uploadText(
        context.app,
        1,
        "owned.txt",
        "Owned material discusses market equilibrium and prices."
    );
    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other', 'chunks-other@example.com')
    `).run().lastInsertRowid);
    const otherCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private', 'PRIVATE CHUNKS', 'Fall')
    `).run(otherUserId).lastInsertRowid);
    const otherMaterialId = insertMaterial(context.database, {
        courseId: otherCourseId,
        unitId: null,
        originalFilename: "private.txt",
        storedFilename: "private-chunks.txt",
        extractedText: "Private material discusses confidential equilibrium notes."
    });
    context.app.locals.materialIndexingService.rebuildMaterial({
        id: otherMaterialId,
        courseId: otherCourseId,
        extractedText: "Private material discusses confidential equilibrium notes.",
        extractionStatus: "extracted"
    });
    const retrieval = context.app.locals.retrievalService;

    assert.throws(() => retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: otherUserId,
        materialIds: [own.body.id],
        query: "equilibrium"
    }), error => error.code === "COURSE_NOT_FOUND");
    assert.throws(() => retrieval.retrieveRelevantChunks({
        courseId: 1,
        userId: 1,
        materialIds: [otherMaterialId],
        query: "equilibrium"
    }), error => error.code === "MATERIAL_CONTEXT_INVALID");
    assert.throws(() => retrieval.retrieveRelevantChunks({
        courseId: otherCourseId,
        userId: otherUserId,
        materialIds: [otherMaterialId],
        query: "equilibrium",
        limit: 21
    }), error => error.code === "VALIDATION_ERROR");
});
