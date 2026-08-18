const test = require("node:test");
const assert = require("node:assert/strict");
const { authenticatedRequest: request } = require("./helpers/test-app");
const { AppError } = require("../src/utils/app-error");
const {
    createTestApp,
    insertMaterial
} = require("./helpers/test-app");

const validStudyGuide = `
KEY CONCEPTS
1. Supply and demand
DEFINITIONS
1. Demand: willingness to buy
FORMULAS
1. No formula provided
COMMON MISTAKES
1. Confusing shifts and movements
EXAM QUESTIONS
1. What shifts demand?
ADDITIONAL TIPS
1. Review the notes
`.trim();

function validQuiz(questionCount = 5) {
    return {
        questions: Array.from({ length: questionCount }, (_, index) => ({
            question: `Question ${index + 1}?`,
            options: ["A", "B", "C", "D"],
            correctAnswer: index % 4,
            explanation: `Explanation ${index + 1}`
        }))
    };
}

function queuedAi(responses, prompts = []) {
    return {
        async generate(prompt) {
            prompts.push(prompt);
            const response = responses.shift();

            if (response instanceof Error) {
                throw response;
            }

            return response;
        }
    };
}

test("course-aware study guides validate context and persist material rows", async t => {
    const prompts = [];
    const context = createTestApp({
        aiClient: queuedAi([validStudyGuide], prompts)
    });
    t.after(context.cleanup);
    const firstMaterialId = insertMaterial(context.database);
    const secondMaterialId = insertMaterial(context.database, {
        storedFilename: "second-material.txt",
        originalFilename: "Second material.txt",
        extractedText: "Second source content."
    });

    const response = await request(context.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [secondMaterialId, firstMaterialId] })
        .expect(201);

    assert.equal(response.body.userId, 1);
    assert.equal(response.body.courseId, 1);
    assert.equal(response.body.generatedContent, validStudyGuide);
    assert.deepEqual(response.body.materialIds, [firstMaterialId, secondMaterialId]);
    assert.match(prompts[0], /Supply and demand test content\./);
    assert.match(prompts[0], /Second source content\./);

    const stored = context.database.prepare(`
        SELECT user_id, course_id, generated_content
        FROM generated_study_guides WHERE id = ?
    `).get(response.body.id);
    assert.deepEqual(stored, {
        user_id: 1,
        course_id: 1,
        generated_content: validStudyGuide
    });

    const contextRows = context.database.prepare(`
        SELECT material_id FROM study_guide_materials
        WHERE study_guide_id = ? ORDER BY material_id
    `).all(response.body.id);
    assert.deepEqual(
        contextRows.map(row => row.material_id),
        [firstMaterialId, secondMaterialId]
    );
});

test("course-aware quizzes run second-pass verification and persist JSON/context", async t => {
    const prompts = [];
    const quiz = validQuiz();
    const context = createTestApp({
        aiClient: queuedAi([
            JSON.stringify(quiz),
            JSON.stringify({ valid: true, issues: [] })
        ], prompts)
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const response = await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(201);

    assert.deepEqual(response.body.quiz, quiz);
    assert.equal(response.body.courseId, 1);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /strict second-pass quiz verifier/i);

    const stored = context.database.prepare(`
        SELECT user_id, course_id, generated_quiz_json
        FROM generated_quizzes WHERE id = ?
    `).get(response.body.id);
    assert.equal(stored.user_id, 1);
    assert.equal(stored.course_id, 1);
    assert.deepEqual(JSON.parse(stored.generated_quiz_json), quiz);

    const contextRows = context.database.prepare(`
        SELECT material_id FROM quiz_materials WHERE quiz_id = ?
    `).all(response.body.id);
    assert.deepEqual(contextRows, [{ material_id: materialId }]);
});

test("a failed second-pass verification triggers a fresh generation attempt", async t => {
    const quiz = validQuiz();
    const prompts = [];
    const context = createTestApp({
        aiClient: queuedAi([
            JSON.stringify(quiz),
            JSON.stringify({ valid: false, issues: ["Question 1 is unsupported"] }),
            JSON.stringify(quiz),
            JSON.stringify({ valid: true, issues: [] })
        ], prompts)
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(201);

    assert.equal(prompts.length, 4);
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_quizzes"
        ).get().count,
        1
    );
});

test("cross-course and cross-user materials are rejected before any AI call", async t => {
    let aiCalls = 0;
    const context = createTestApp({
        aiClient: {
            async generate() {
                aiCalls++;
                return validStudyGuide;
            }
        }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);
    const secondCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (1, 'Second', 'SECOND', 'Fall 2026')
    `).run().lastInsertRowid);

    await request(context.app)
        .post(`/api/courses/${secondCourseId}/study-guides`)
        .send({ materialIds: [materialId] })
        .expect(404);

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other', 'other-ai@example.com')
    `).run().lastInsertRowid);
    const privateCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private', 'PRIVATE-AI', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);

    await request(context.app)
        .post(`/api/courses/${privateCourseId}/quizzes`)
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(404);

    assert.equal(aiCalls, 0);
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_study_guides"
        ).get().count,
        0
    );
});

test("malformed study-guide and quiz output is rejected before persistence", async t => {
    const guideContext = createTestApp({
        aiClient: queuedAi(["This has no required sections"])
    });
    t.after(guideContext.cleanup);
    const guideMaterialId = insertMaterial(guideContext.database);

    const guideResponse = await request(guideContext.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [guideMaterialId] })
        .expect(502);
    assert.equal(guideResponse.body.error.code, "AI_OUTPUT_INVALID");
    assert.equal(
        guideContext.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_study_guides"
        ).get().count,
        0
    );

    const quizContext = createTestApp({
        aiClient: queuedAi(["not json", "not json", "not json"])
    });
    t.after(quizContext.cleanup);
    const quizMaterialId = insertMaterial(quizContext.database);

    const quizResponse = await request(quizContext.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [quizMaterialId], questionCount: 5 })
        .expect(502);
    assert.equal(quizResponse.body.error.code, "AI_QUIZ_GENERATION_FAILED");
    assert.equal(
        quizContext.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_quizzes"
        ).get().count,
        0
    );
});

test("AI failures and timeouts return stable errors without persistence", async t => {
    const failureContext = createTestApp({
        aiClient: queuedAi([new Error("connection refused")])
    });
    t.after(failureContext.cleanup);
    const failureMaterialId = insertMaterial(failureContext.database);

    const failure = await request(failureContext.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [failureMaterialId] })
        .expect(502);
    assert.equal(failure.body.error.code, "AI_SERVICE_ERROR");

    const timeoutContext = createTestApp({
        aiClient: queuedAi([new AppError({
            code: "AI_TIMEOUT",
            message: "The AI service timed out.",
            status: 504
        })])
    });
    t.after(timeoutContext.cleanup);
    const timeoutMaterialId = insertMaterial(timeoutContext.database);

    const timeout = await request(timeoutContext.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [timeoutMaterialId] })
        .expect(504);
    assert.equal(timeout.body.error.code, "AI_TIMEOUT");
});

test("quiz attempts can be created and retrieved only by the quiz owner", async t => {
    const quiz = validQuiz();
    const context = createTestApp({
        aiClient: queuedAi([
            JSON.stringify(quiz),
            JSON.stringify({ valid: true, issues: [] })
        ])
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);
    const generated = await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(201);

    const created = await request(context.app)
        .post(`/api/quizzes/${generated.body.id}/attempts`)
        .send({
            score: 80,
            answers: [0, 1, 2, 3, 0],
            results: { correct: 4, total: 5 }
        })
        .expect(201);

    assert.equal(created.body.quizId, generated.body.id);
    assert.equal(created.body.score, 80);
    assert.deepEqual(created.body.answers, [0, 1, 2, 3, 0]);

    const listed = await request(context.app)
        .get(`/api/quizzes/${generated.body.id}/attempts`)
        .expect(200);
    assert.deepEqual(listed.body, [created.body]);

    await request(context.app)
        .post(`/api/quizzes/${generated.body.id}/attempts`)
        .send({ score: 101, answers: [] })
        .expect(400);

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other', 'attempt@example.com')
    `).run().lastInsertRowid);
    const otherCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Other', 'OTHER-Q', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);
    const otherQuizId = Number(context.database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (?, ?, ?)
    `).run(otherUserId, otherCourseId, JSON.stringify(quiz)).lastInsertRowid);

    await request(context.app)
        .get(`/api/quizzes/${otherQuizId}/attempts`)
        .expect(404);
});

test("legacy study-guide and quiz routes preserve responses and now persist", async t => {
    const quiz = validQuiz();
    const prompts = [];
    const context = createTestApp({
        aiClient: queuedAi([
            validStudyGuide,
            JSON.stringify(quiz),
            JSON.stringify({ valid: true, issues: [] })
        ], prompts)
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const guide = await request(context.app)
        .post("/api/study-guide")
        .send({ materialIds: [materialId] })
        .expect(200);
    assert.equal(guide.body.success, true);
    assert.equal(guide.body.studyGuide, validStudyGuide);
    assert.ok(guide.body.studyGuideId);

    const generatedQuiz = await request(context.app)
        .post("/api/quiz")
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(200);
    assert.equal(generatedQuiz.body.success, true);
    assert.deepEqual(generatedQuiz.body.quiz, quiz);
    assert.ok(generatedQuiz.body.quizId);
    assert.equal(prompts.length, 3);

    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_study_guides"
        ).get().count,
        1
    );
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_quizzes"
        ).get().count,
        1
    );
});

test("AI safeguards reject empty and oversized material context before provider calls", async t => {
    let aiCalls = 0;
    const context = createTestApp({
        config: { aiMaxContextCharacters: 50 },
        aiClient: {
            async generate() {
                aiCalls++;
                return validStudyGuide;
            }
        }
    });
    t.after(context.cleanup);
    const emptyId = insertMaterial(context.database, {
        storedFilename: "empty.txt",
        originalFilename: "Empty.txt",
        extractedText: "   "
    });
    const largeId = insertMaterial(context.database, {
        storedFilename: "large.txt",
        originalFilename: "Large.txt",
        extractedText: "x".repeat(100)
    });

    const empty = await request(context.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [emptyId] })
        .expect(422);
    assert.equal(empty.body.error.code, "MATERIAL_HAS_NO_TEXT");

    const large = await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [largeId], questionCount: 5 })
        .expect(413);
    assert.equal(large.body.error.code, "AI_CONTEXT_TOO_LARGE");
    assert.equal(aiCalls, 0);
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_study_guides"
        ).get().count,
        0
    );
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM generated_quizzes"
        ).get().count,
        0
    );
});

test("configured quiz question limits reject requests before provider calls", async t => {
    let aiCalls = 0;
    const context = createTestApp({
        config: {
            aiQuizMinQuestions: 5,
            aiQuizMaxQuestions: 10
        },
        aiClient: {
            async generate() {
                aiCalls++;
                return "unexpected";
            }
        }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const response = await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 15 })
        .expect(400);

    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(response.body.error.details.allowedQuestionCounts, [5, 10]);
    assert.equal(aiCalls, 0);
});

test("AI generation routes enforce the per-user workflow rate limit", async t => {
    const context = createTestApp({
        config: {
            aiRateLimitWindowMs: 600000,
            aiRateLimitMaxRequests: 1
        },
        aiClient: queuedAi([validStudyGuide])
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    await request(context.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [materialId] })
        .expect(201);

    const limited = await request(context.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [materialId] })
        .expect(429);
    assert.equal(limited.body.error.code, "AI_RATE_LIMIT_EXCEEDED");
    assert.ok(limited.body.error.details.retryAfterMs > 0);
});

test("quiz retries and verification retain one concurrency permit", async t => {
    const quiz = validQuiz();
    let activeProviderCalls = 0;
    let maximumProviderCalls = 0;
    const responses = [
        JSON.stringify(quiz),
        JSON.stringify({ valid: false, issues: ["retry"] }),
        JSON.stringify(quiz),
        JSON.stringify({ valid: true, issues: [] })
    ];
    let guardedWorkflows = 0;
    const context = createTestApp({
        config: { aiMaxConcurrentRequests: 1 },
        aiUsageGuard: {
            async execute(userId, operation) {
                assert.equal(userId, 1);
                guardedWorkflows++;
                return operation();
            }
        },
        aiClient: {
            async generate() {
                activeProviderCalls++;
                maximumProviderCalls = Math.max(maximumProviderCalls, activeProviderCalls);
                await new Promise(resolve => setImmediate(resolve));
                activeProviderCalls--;
                return responses.shift();
            }
        }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    await request(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 5 })
        .expect(201);

    assert.equal(maximumProviderCalls, 1);
    assert.equal(guardedWorkflows, 1);
    assert.equal(responses.length, 0);
});
