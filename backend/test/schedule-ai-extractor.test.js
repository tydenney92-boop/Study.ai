const test = require("node:test");
const assert = require("node:assert/strict");
const { createScheduleAiExtractor, shouldUseAi, validateAiEvents } = require("../src/services/schedule-ai-extractor");

test("AI fallback trigger stays off for useful deterministic output", () => {
    assert.equal(shouldUseAi({ summary: { confirmed: 3, ambiguous: 1 } }), false);
    assert.equal(shouldUseAi({ summary: { confirmed: 1, ambiguous: 1 } }), true);
});

test("AI schedule validation rejects hallucinated evidence, invalid dates, and duplicate events", () => {
    const source = "Midterm 1 — Sep 29\nHomework 2 — Sep 18 at 13:30";
    const response = JSON.stringify({ events: [
        { title: "Midterm 1", type: "exam", dueDate: "2026-09-29", dueTime: null, sourceText: "Midterm 1 — Sep 29", confidence: "high" },
        { title: "Midterm 1", type: "exam", dueDate: "2026-09-29", dueTime: null, sourceText: "Midterm 1 — Sep 29", confidence: "high" },
        { title: "Final Exam", type: "exam", dueDate: "2026-12-10", dueTime: null, sourceText: "Final Exam — Dec 10", confidence: "high" },
        { title: "Homework 2", type: "assignment", dueDate: "2026-02-30", dueTime: "25:00", sourceText: "Homework 2 — Sep 18 at 13:30", confidence: "high" }
    ] });
    const events = validateAiEvents(response, source);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Midterm 1");
});

test("malformed AI JSON is contained and deterministic callers can continue", async () => {
    const logs = [];
    const extractor = createScheduleAiExtractor({
        aiClient: { provider: "fake", async generate() { return "not json"; } },
        output: { log(value) { logs.push(value); } }
    });
    const result = await extractor.extract("Midterm 1 Sep 29", { semester: "Fall 2026" });
    assert.deepEqual(result, { status: "unavailable", candidates: [] });
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs[0], /Midterm 1/);
});
