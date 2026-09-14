const { callAi } = require("./ai-call");
const { parseJsonResponse } = require("./ai-response-validation");
const { buildScheduleExtractionPrompt } = require("./ai-prompts");
const {
    ACADEMIC_EVENT,
    SUPPRESSED_CONTEXT,
    identityKey,
    isReview,
    typeFor
} = require("./schedule-parser");

const TYPES = new Set(["assignment", "quiz", "exam", "reading", "project", "paper", "other"]);
const DATE_SIGNAL = /\b(?:due|deadline|exam|midterm|final|quiz|assignment|homework|problem set|project|paper|presentation|reading|lab|discussion|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{1,2})\b/i;
const MAX_SOURCE_CHARACTERS = 12000;
const MAX_EVENTS = 40;
const EXPLICIT_DATE = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/i;

function comparable(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function boundedScheduleText(text) {
    const lines = String(text || "").split(/\r?\n/);
    const selected = new Set();
    lines.forEach((line, index) => {
        if (!DATE_SIGNAL.test(line)) return;
        for (let offset = -1; offset <= 1; offset++) {
            if (lines[index + offset]?.trim()) selected.add(index + offset);
        }
    });
    const likely = [...selected].sort((a, b) => a - b).map(index => lines[index]).join("\n");
    return (likely || lines.slice(0, 120).join("\n")).slice(0, MAX_SOURCE_CHARACTERS);
}

function shouldUseAi(result) {
    return result.summary.confirmed < 2 ||
        (result.summary.ambiguous > 0 && result.summary.ambiguous >= result.summary.confirmed);
}

function validateAiEvents(response, sourceText) {
    const payload = parseJsonResponse(response);
    if (!payload || !Array.isArray(payload.events) || payload.events.length > MAX_EVENTS) {
        throw new Error("Schedule extraction returned an invalid event list.");
    }
    const searchable = comparable(sourceText);
    const seen = new Set();
    const events = [];
    for (const event of payload.events) {
        if (!event || typeof event.title !== "string" || !event.title.trim() || event.title.length > 200 ||
            !TYPES.has(event.type) || typeof event.sourceText !== "string" || !event.sourceText.trim() ||
            !["high", "moderate", "low"].includes(event.confidence)) continue;
        const evidence = comparable(event.sourceText);
        if (!searchable.includes(evidence) || !ACADEMIC_EVENT.test(event.title) || !ACADEMIC_EVENT.test(event.sourceText) || !EXPLICIT_DATE.test(event.sourceText) ||
            SUPPRESSED_CONTEXT.test(event.sourceText)) continue;
        const dueDate = event.dueDate === null ? null : String(event.dueDate || "");
        const dueTime = event.dueTime === null ? null : String(event.dueTime || "");
        if (dueDate) {
            const parts = dueDate.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
            if (!parts) continue;
            const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
            if (date.getUTCFullYear() !== Number(parts[1]) || date.getUTCMonth() + 1 !== Number(parts[2]) || date.getUTCDate() !== Number(parts[3])) continue;
        }
        if (dueTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) continue;
        const review = isReview(event.title);
        const type = review ? "other" : typeFor(event.title) === "other" ? event.type : typeFor(event.title);
        const key = identityKey(event.title, review ? "exam_review" : type);
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
            key,
            title: event.title.trim(),
            type,
            eventKind: review ? "exam_review" : type,
            dateText: null,
            dueDate: dueDate || null,
            dueTime: dueTime || null,
            sourceText: event.sourceText.trim().slice(0, 500),
            confidence: event.confidence,
            status: dueDate ? "confirmed" : "ambiguous",
            selected: Boolean(dueDate && event.confidence !== "low" && !review),
            yearInferred: false,
            extractionSource: "ai"
        });
    }
    return events;
}

function createScheduleAiExtractor({ aiClient, output = console }) {
    return {
        shouldUseAi,
        async extract(text, { semester = "" } = {}) {
            const sourceText = boundedScheduleText(text);
            try {
                const response = await callAi(aiClient, buildScheduleExtractionPrompt(sourceText, semester), {
                    workflow: "schedule_extraction",
                    tier: "fast"
                });
                return { status: "used", candidates: validateAiEvents(response, sourceText) };
            } catch (error) {
                output.log(JSON.stringify({
                    level: "warn",
                    event: "schedule_ai_fallback_unavailable",
                    errorCode: error.code || "SCHEDULE_AI_INVALID"
                }));
                return { status: "unavailable", candidates: [] };
            }
        }
    };
}

module.exports = {
    MAX_EVENTS,
    MAX_SOURCE_CHARACTERS,
    boundedScheduleText,
    createScheduleAiExtractor,
    shouldUseAi,
    validateAiEvents
};
