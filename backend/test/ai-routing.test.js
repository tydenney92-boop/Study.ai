const test = require("node:test");
const assert = require("node:assert/strict");
const { createAskNotesService } = require("../src/services/ask-notes.service");
const { createFlashcardGenerationService } = require("../src/services/flashcard-generation.service");
const { createQuizGenerationService } = require("../src/services/quiz-generation.service");
const { createStudyGuideService } = require("../src/services/study-guide.service");
const { callAi } = require("../src/services/ai-call");

const validGuide = `
KEY CONCEPTS
1. Markets
DEFINITIONS
1. Demand
FORMULAS
1. None supplied
COMMON MISTAKES
1. Confusing a shift and movement
EXAM QUESTIONS
1. What shifts demand?
ADDITIONAL TIPS
1. Review the source
`.trim();

function validQuiz(count = 5) {
    return {
        questions: Array.from({ length: count }, (_, index) => ({
            question: `Question ${index + 1}?`,
            options: ["Alpha", "Beta", "Gamma", "Delta"],
            correctAnswer: index % 4,
            explanation: `Explanation ${index + 1}.`
        }))
    };
}

function validCards(count = 5) {
    return {
        flashcards: Array.from({ length: count }, (_, index) => ({
            front: `Concept ${index + 1}?`,
            back: `Answer ${index + 1}.`
        }))
    };
}

function materialContext(materialCount = 1, content = "Course source text.") {
    return {
        resolve() {
            return {
                courseContent: content,
                materialIds: Array.from({ length: materialCount }, (_, index) => index + 1),
                materials: Array.from({ length: materialCount }, (_, index) => ({
                    id: index + 1,
                    name: `Source ${index + 1}.txt`
                }))
            };
        }
    };
}

function capturingClient(responses) {
    const calls = [];
    return {
        calls,
        async generate(prompt, options) {
            calls.push({ prompt, options });
            const response = responses.shift();
            if (response instanceof Error) throw response;
            return response;
        }
    };
}

test("Ask My Notes defaults to fast and deterministically promotes synthesis", async () => {
    const directClient = capturingClient([JSON.stringify({
        answer: "Direct answer.", supportType: "grounded"
    })]);
    const directService = createAskNotesService({
        aiClient: directClient,
        materialContextService: materialContext()
    });
    await directService.ask({
        courseId: 1,
        userId: 1,
        materialIds: [1],
        question: "What is demand?"
    });
    assert.deepEqual(directClient.calls[0].options, {
        workflow: "ask_notes",
        tier: "fast",
        escalated: false
    });

    const synthesisClient = capturingClient([JSON.stringify({
        answer: "Synthesis answer.", supportType: "grounded_with_explanation"
    })]);
    const synthesisService = createAskNotesService({
        aiClient: synthesisClient,
        materialContextService: materialContext()
    });
    await synthesisService.ask({
        courseId: 1,
        userId: 1,
        materialIds: [1],
        question: "Compare supply and demand and analyze their relationship."
    });
    assert.deepEqual(synthesisClient.calls[0].options, {
        workflow: "ask_notes",
        tier: "standard",
        escalated: true
    });
});

test("three Ask My Notes sources or large context select standard", async () => {
    for (const context of [
        materialContext(3),
        materialContext(1, "x".repeat(30001))
    ]) {
        const client = capturingClient([JSON.stringify({
            answer: "Answer.", supportType: "grounded"
        })]);
        const service = createAskNotesService({ aiClient: client, materialContextService: context });
        await service.ask({
            courseId: 1,
            userId: 1,
            materialIds: [1],
            question: "Define demand."
        });
        assert.equal(client.calls[0].options.tier, "standard");
    }
});

test("flashcards default to fast and only promote on the bounded final retry", async () => {
    const client = capturingClient([
        "not json",
        JSON.stringify(validCards())
    ]);
    const service = createFlashcardGenerationService({
        aiClient: client,
        materialContextService: materialContext(),
        flashcardsRepository: { createBatch(value) { return value; } },
        minCards: 5,
        maxCards: 20,
        defaultCards: 5,
        maxAttempts: 2
    });
    await service.generate({ courseId: 1, userId: 1, materialIds: [1], cardCount: 5 });
    assert.deepEqual(client.calls.map(call => call.options), [
        { workflow: "flashcard_generation", tier: "fast", escalated: false },
        { workflow: "flashcard_generation", tier: "standard", escalated: true }
    ]);
});

test("study guides default to standard and only promote on the bounded final retry", async () => {
    const client = capturingClient(["invalid", validGuide]);
    const service = createStudyGuideService({
        aiClient: client,
        materialContextService: materialContext(),
        studyGuidesRepository: { createWithMaterials(value) { return value; } },
        maxAttempts: 2
    });
    await service.generate({ courseId: 1, userId: 1, materialIds: [1] });
    assert.deepEqual(client.calls.map(call => call.options), [
        { workflow: "study_guide_generation", tier: "standard", escalated: false },
        { workflow: "study_guide_generation", tier: "advanced", escalated: true }
    ]);
});

test("quiz success stays standard and verification uses standard", async () => {
    const client = capturingClient([
        JSON.stringify(validQuiz()),
        JSON.stringify({ valid: true, issues: [] })
    ]);
    const service = createQuizGenerationService({
        aiClient: client,
        materialContextService: materialContext(),
        quizzesRepository: { createWithMaterials(value) { return value; } },
        maxAttempts: 3
    });
    await service.generate({
        courseId: 1,
        userId: 1,
        materialIds: [1],
        questionCount: 5
    });
    assert.deepEqual(client.calls.map(call => call.options), [
        { workflow: "quiz_generation", tier: "standard", escalated: false },
        { workflow: "quiz_verification", tier: "standard", escalated: false }
    ]);
});

test("quiz validation failures use advanced only for the final permitted generation", async () => {
    const client = capturingClient([
        "not json",
        "still not json",
        JSON.stringify(validQuiz()),
        JSON.stringify({ valid: true, issues: [] })
    ]);
    const service = createQuizGenerationService({
        aiClient: client,
        materialContextService: materialContext(),
        quizzesRepository: { createWithMaterials(value) { return value; } },
        maxAttempts: 3
    });
    await service.generate({
        courseId: 1,
        userId: 1,
        materialIds: [1],
        questionCount: 5
    });
    assert.deepEqual(
        client.calls.filter(call => call.options.workflow === "quiz_generation")
            .map(call => call.options.tier),
        ["standard", "standard", "advanced"]
    );
});

test("quiz attempt limits remain enforced without persistence", async () => {
    const client = capturingClient(["bad 1", "bad 2", "bad 3", "unused"]);
    let persisted = 0;
    const service = createQuizGenerationService({
        aiClient: client,
        materialContextService: materialContext(),
        quizzesRepository: { createWithMaterials() { persisted++; } },
        maxAttempts: 3
    });
    await assert.rejects(
        () => service.generate({
            courseId: 1,
            userId: 1,
            materialIds: [1],
            questionCount: 5
        }),
        error => error.code === "AI_QUIZ_GENERATION_FAILED"
    );
    assert.equal(client.calls.length, 3);
    assert.equal(persisted, 0);
});

test("structured model-selection logs exclude prompts, output, and secrets", async t => {
    const messages = [];
    const originalLog = console.log;
    console.log = message => messages.push(message);
    t.after(() => { console.log = originalLog; });
    const client = {
        provider: "openai",
        apiKey: "sk-never-log-this",
        async generate() { return "private model response"; }
    };

    await callAi(client, "private uploaded source text", {
        workflow: "study_guide_generation",
        tier: "standard",
        escalated: false
    });
    const logged = messages.join("\n");
    assert.match(logged, /ai_model_selected/);
    assert.match(logged, /study_guide_generation/);
    assert.match(logged, /standard/);
    assert.doesNotMatch(logged, /private uploaded source text/);
    assert.doesNotMatch(logged, /private model response/);
    assert.doesNotMatch(logged, /sk-never-log-this/);
});
