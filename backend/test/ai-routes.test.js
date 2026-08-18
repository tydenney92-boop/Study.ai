const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
    createTestApp,
    insertMaterial
} = require("./helpers/test-app");

test("study guides use the injected AI client and preserve the response shape", async t => {
    const prompts = [];
    const context = createTestApp({
        aiClient: {
            async generate(prompt) {
                prompts.push(prompt);
                return "KEY CONCEPTS\n\n1. Supply and demand";
            }
        }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const response = await request(context.app)
        .post("/api/study-guide")
        .send({ materialIds: [materialId] })
        .expect(200);

    assert.equal(response.body.success, true);
    assert.equal(
        response.body.studyGuide,
        "KEY CONCEPTS\n\n1. Supply and demand"
    );
    assert.match(prompts[0], /Supply and demand test content\./);
});

test("quizzes use the injected AI client and preserve validated quiz JSON", async t => {
    const quiz = {
        questions: Array.from({ length: 5 }, (_, index) => ({
            question: `Question ${index + 1}?`,
            options: ["A", "B", "C", "D"],
            correctAnswer: index % 4,
            explanation: `Explanation ${index + 1}`
        }))
    };

    const context = createTestApp({
        aiClient: {
            async generate() {
                return JSON.stringify(quiz);
            }
        }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);

    const response = await request(context.app)
        .post("/api/quiz")
        .send({
            materialIds: [materialId],
            questionCount: 5
        })
        .expect(200);

    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.quiz, quiz);
});
