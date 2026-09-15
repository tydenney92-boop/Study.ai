const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildRecommendationExplanation,
    priorityForRecommendation,
    priorityForTask
} = require("../src/services/recommendation-explanations");

test("explanations use only provided exam, quiz, and flashcard evidence", () => {
    const explanation = buildRecommendationExplanation({
        examDays: 4,
        signals: { quizMisses: 3, flashcardIncorrect: 2 }
    });
    assert.deepEqual(explanation.reasons, [
        "Exam in 4 days",
        "3 recorded quiz misses",
        "2 Still Learning flashcard reviews"
    ]);
    assert.equal(
        explanation.summary,
        "Recommended because your exam is soon and recent quiz results show weakness in this topic."
    );
});

test("assignment urgency and low mastery explanations remain deterministic", () => {
    assert.deepEqual(
        buildRecommendationExplanation({ taskDays: 1, taskTitle: "Assignment" }).reasons,
        ["Assignment tomorrow"]
    );
    assert.deepEqual(
        buildRecommendationExplanation({ signals: { lowMasteryCards: 4 } }).reasons,
        ["4 low-mastery flashcards"]
    );
});

test("no evidence produces no fabricated recommendation reason", () => {
    const explanation = buildRecommendationExplanation();
    assert.deepEqual(explanation.reasons, []);
    assert.equal(explanation.summary, null);
});

test("priority labels map existing recommendation tiers and task urgency", () => {
    assert.equal(priorityForRecommendation("focusFirst"), "high");
    assert.equal(priorityForRecommendation("reviewNext"), "medium");
    assert.equal(priorityForRecommendation("keepFresh"), "low");
    assert.equal(priorityForTask(74), "high");
    assert.equal(priorityForTask(38), "medium");
    assert.equal(priorityForTask(10), "low");
});
