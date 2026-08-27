const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    createTestApp,
    authenticatedRequest: request,
    insertMaterial
} = require("./helpers/test-app");
const {
    createAskNotesFollowUpService
} = require("../src/services/ask-notes-follow-up.service");

function addMaterial(context, overrides) {
    const id = insertMaterial(context.database, overrides);
    const material = context.database.prepare(`
        SELECT id, course_id AS courseId, extracted_text AS extractedText,
               extraction_status AS extractionStatus
        FROM materials WHERE id = ?
    `).get(id);
    context.app.locals.materialIndexingService.rebuildMaterial(material);
    return id;
}

test("Ask My Notes persists a natural multi-turn follow-up and restores it", async t => {
    const prompts = [];
    const context = createTestApp({
        config: { aiRateLimitMaxRequests: 20 },
        aiClient: {
            async generate(prompt) {
                prompts.push(prompt);
                const explanation = /Expl(?:ai|ia)n that|example|differ/i.test(prompt);
                return JSON.stringify({
                    answer: explanation ? "A simpler grounded explanation." : "Elasticity is responsiveness.",
                    supportType: explanation ? "grounded_with_explanation" : "grounded"
                });
            }
        }
    });
    t.after(context.cleanup);
    const materialId = addMaterial(context, {
        originalFilename: "Elasticity.txt",
        extractedText: "Price elasticity of demand measures responsiveness. Income elasticity compares demand changes caused by income."
    });
    const first = await request(context.app).post("/api/courses/1/ask").send({
        materialIds: [materialId], question: "What is price elasticity of demand?"
    }).expect(200);
    assert.ok(first.body.conversationId > 0);
    const followUps = [
        "Explain that more simply.",
        "Can you give me another example?",
        "Explian that differently.",
        "How is that different from income elasticity?"
    ];
    for (const question of followUps) {
        const response = await request(context.app).post("/api/courses/1/ask").send({
            conversationId: first.body.conversationId,
            materialIds: [materialId],
            question
        }).expect(200);
        assert.equal(response.body.conversationId, first.body.conversationId);
        assert.equal(response.body.supportType, "grounded_with_explanation");
    }
    assert.match(prompts[1], /prior_student_questions_for_intent_only/);
    assert.match(prompts[1], /What is price elasticity of demand/);
    assert.equal(prompts.length, 5, "follow-up resolution must not add AI calls");
    const restored = await request(context.app)
        .get(`/api/courses/1/ask/conversations/${first.body.conversationId}`)
        .expect(200);
    assert.equal(restored.body.messages.length, 10);
    assert.equal(restored.body.messages[0].content, "What is price elasticity of demand?");
    assert.equal(restored.body.messages.at(-1).supportType, "grounded_with_explanation");
    assert.deepEqual(restored.body.messages.at(-1).sources, [{
        materialId,
        name: "Elasticity.txt"
    }]);
    const recent = await request(context.app)
        .get("/api/courses/1/ask/conversations").expect(200);
    assert.equal(recent.body[0].id, first.body.conversationId);
    assert.match(recent.body[0].preview, /price elasticity/);
});

test("current material selection remains authoritative across follow-ups", async t => {
    let calls = 0;
    const context = createTestApp({
        config: { aiRateLimitMaxRequests: 20 },
        aiClient: {
            async generate() {
                calls++;
                return '{"answer":"Grounded.","supportType":"grounded"}';
            }
        }
    });
    t.after(context.cleanup);
    const economicsId = addMaterial(context, {
        originalFilename: "Economics.txt",
        extractedText: "Elasticity measures the responsiveness of quantity demanded."
    });
    const biologyId = addMaterial(context, {
        originalFilename: "Biology.txt",
        storedFilename: "biology.txt",
        extractedText: "Mitochondria produce cellular energy through respiration."
    });
    const first = await request(context.app).post("/api/courses/1/ask").send({
        materialIds: [economicsId], question: "What is elasticity?"
    }).expect(200);
    const changed = await request(context.app).post("/api/courses/1/ask").send({
        conversationId: first.body.conversationId,
        materialIds: [biologyId],
        question: "Give me another example of that."
    }).expect(200);
    assert.equal(changed.body.supportType, "not_found");
    assert.deepEqual(changed.body.sources, []);
    assert.equal(calls, 1);
    const restored = await request(context.app)
        .get(`/api/courses/1/ask/conversations/${first.body.conversationId}`)
        .expect(200);
    const changedUserMessage = restored.body.messages.at(-2);
    assert.deepEqual(changedUserMessage.materialIds, [biologyId]);
});

test("stored assistant hallucinations never become retrieval or prompt evidence", async t => {
    const prompts = [];
    const context = createTestApp({
        config: { aiRateLimitMaxRequests: 20 },
        aiClient: {
            async generate(prompt) {
                prompts.push(prompt);
                return prompts.length === 1
                    ? '{"answer":"Unsupported claim: the professor guarantees a curve.","supportType":"grounded"}'
                    : '{"answer":"Elasticity explained from the notes.","supportType":"grounded_with_explanation"}';
            }
        }
    });
    t.after(context.cleanup);
    const materialId = addMaterial(context, {
        originalFilename: "Elasticity.txt",
        extractedText: "Elasticity measures responsiveness to a price change."
    });
    const first = await request(context.app).post("/api/courses/1/ask").send({
        materialIds: [materialId], question: "What is elasticity?"
    }).expect(200);
    await request(context.app).post("/api/courses/1/ask").send({
        conversationId: first.body.conversationId,
        materialIds: [materialId],
        question: "Explain that more simply."
    }).expect(200);
    assert.doesNotMatch(prompts[1], /professor guarantees a curve/i);
    assert.match(prompts[1], /What is elasticity/);
});

test("unsupported follow-ups remain not-found and conversation ownership is isolated", async t => {
    let calls = 0;
    const context = createTestApp({
        aiClient: {
            async generate() {
                calls++;
                return '{"answer":"Grounded.","supportType":"grounded"}';
            }
        }
    });
    t.after(context.cleanup);
    const materialId = addMaterial(context, {
        originalFilename: "Demand.txt",
        extractedText: "Demand describes willingness and ability to buy."
    });
    const first = await request(context.app).post("/api/courses/1/ask").send({
        materialIds: [materialId], question: "What is demand?"
    }).expect(200);
    const unsupported = await request(context.app).post("/api/courses/1/ask").send({
        conversationId: first.body.conversationId,
        materialIds: [materialId],
        question: "What did my professor say is due next?"
    }).expect(200);
    assert.equal(unsupported.body.supportType, "not_found");
    assert.equal(calls, 1);

    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({
        name: "Other", email: "chat-other@example.com", password: "StrongPass123!"
    }).expect(201);
    await other.get(`/api/courses/1/ask/conversations/${first.body.conversationId}`)
        .expect(404);
    await other.post("/api/courses/1/ask").send({
        conversationId: first.body.conversationId,
        materialIds: [materialId],
        question: "Explain that."
    }).expect(404);

    const secondCourse = await request(context.app).post("/api/courses").send({
        courseName: "Second Course", courseCode: "SECOND 101", semester: "Fall"
    }).expect(201);
    await request(context.app)
        .get(`/api/courses/${secondCourse.body.id}/ask/conversations/${first.body.conversationId}`)
        .expect(404);
});

test("conversation history limits are deterministic and New Conversation resets context", async t => {
    const resolver = createAskNotesFollowUpService({ maxTurns: 2, maxCharacters: 24 });
    const bounded = resolver.boundedStudentTurns([
        { role: "user", content: "First old concept" },
        { role: "assistant", content: "Assistant content is ignored" },
        { role: "user", content: "Second concept" },
        { role: "user", content: "Newest concept" }
    ]);
    assert.deepEqual(bounded, ["Second con", "Newest concept"]);
    assert.doesNotMatch(bounded.join(" "), /Assistant/);

    const context = createTestApp();
    t.after(context.cleanup);
    const created = await request(context.app)
        .post("/api/courses/1/ask/conversations").send({}).expect(201);
    assert.equal(created.body.messageCount, 0);
    const restored = await request(context.app)
        .get(`/api/courses/1/ask/conversations/${created.body.id}`).expect(200);
    assert.deepEqual(restored.body.messages, []);
});
