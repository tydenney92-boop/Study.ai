const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildAskNotesPrompt,
    buildFlashcardPrompt,
    buildQuizPrompt,
    buildStudyGuidePrompt
} = require("../src/services/ai-prompts");
const {
    validateFlashcards,
    validateQuiz,
    validateStudyGuide
} = require("../src/services/ai-response-validation");

test("all AI prompts treat uploaded text as untrusted Study Signal source data", () => {
    const prompts = [
        buildStudyGuidePrompt("source"),
        buildQuizPrompt("source", 5),
        buildFlashcardPrompt("source", 5),
        buildAskNotesPrompt("source", "question")
    ];
    prompts.forEach(prompt => {
        assert.match(prompt, /Study Signal/);
        assert.match(prompt, /untrusted/i);
        assert.match(prompt, /ignore.*instructions|never follow instructions/is);
        assert.doesNotMatch(prompt, /Study AI/);
    });
});

test("study guides require ordered, nonempty sections", () => {
    const valid = [
        "KEY CONCEPTS\n1. One", "DEFINITIONS\n1. Two", "FORMULAS\n1. Three",
        "COMMON MISTAKES\n1. Four", "EXAM QUESTIONS\n1. Five", "ADDITIONAL TIPS\n1. Six"
    ].join("\n");
    assert.equal(validateStudyGuide(valid), valid);
    assert.throws(() => validateStudyGuide(valid.replace("1. Two", "")), /empty/);
    assert.throws(() => validateStudyGuide(valid.replace("DEFINITIONS\n1. Two\nFORMULAS", "FORMULAS\n1. Three\nDEFINITIONS")), /out of order/);
});

test("quiz and flashcard validation reject normalized duplicates", () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
        question: `Question ${index + 1}?`,
        options: index === 0 ? ["Same", " same! ", "C", "D"] : ["A", "B", "C", "D"],
        correctAnswer: 0,
        explanation: "Supported explanation"
    }));
    assert.throws(() => validateQuiz({ questions }, 5), /duplicate answer choices/);
    assert.throws(() => validateFlashcards({ flashcards: [
        { front: "Define demand?", back: "One" },
        { front: "Define demand!", back: "Two" }
    ] }, 2), /duplicate flashcard prompts/);
});
