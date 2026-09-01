const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");

test("exam plans persist owned scope and explicit material roles", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const materialId = insertMaterial(context.database, {
        originalFilename: "midterm.txt",
        extractedText: "The midterm covers elasticity."
    });
    const updated = await authenticatedRequest(context.app)
        .patch(`/api/courses/1/materials/${materialId}`)
        .send({ materialRole: "exam_review" }).expect(200);
    assert.equal(updated.body.materialRole, "exam_review");
    const saved = await authenticatedRequest(context.app).put("/api/courses/1/exam-plan").send({
        examName: "Midterm 1", examDate: "2026-10-01", unitIds: [1],
        materialIds: [materialId], sourceMaterialIds: [materialId]
    }).expect(200);
    assert.equal(saved.body.examName, "Midterm 1");
    assert.deepEqual(saved.body.sourceMaterialIds, [materialId]);
    assert.equal(saved.body.materials.find(item => item.id === materialId).materialRole, "exam_review");
    const reopened = await authenticatedRequest(context.app).get("/api/courses/1/exam-plan").expect(200);
    assert.deepEqual(reopened.body.materialIds, [materialId]);
});

test("exam plans reject foreign course data, unusable sources, and cross-user access", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const noText = insertMaterial(context.database, {
        originalFilename: "scan.pdf", extractedText: "", extractionStatus: "no_text"
    });
    await authenticatedRequest(context.app).put("/api/courses/1/exam-plan").send({
        examName: "Final", examDate: "", unitIds: [], materialIds: [], sourceMaterialIds: [noText]
    }).expect(400);
    await authenticatedRequest(context.app).patch(`/api/courses/1/materials/${noText}`)
        .send({ materialRole: "not-a-role" }).expect(400);

    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({
        name: "Other", email: "exam-plan-other@example.com", password: "StrongPass123!"
    }).expect(201);
    await other.get("/api/courses/1/exam-plan").expect(404);
    await other.put("/api/courses/1/exam-plan").send({
        examName: "Stolen", examDate: "", unitIds: [], materialIds: [], sourceMaterialIds: []
    }).expect(404);
});
