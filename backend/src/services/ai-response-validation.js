const { AppError } = require("../utils/app-error");

function invalidOutput(message, details) {
    return new AppError({
        code: "AI_OUTPUT_INVALID",
        message,
        status: 502,
        details
    });
}

function parseJsonResponse(response) {
    if (typeof response !== "string" || response.trim().length === 0) {
        throw invalidOutput("The AI returned an empty response.");
    }

    let cleaned = response.trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace < firstBrace) {
        throw invalidOutput("The AI response did not contain a JSON object.");
    }

    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        throw invalidOutput("The AI returned malformed JSON.");
    }
}

function validateStudyGuide(response) {
    if (typeof response !== "string" || response.trim().length === 0) {
        throw invalidOutput("The AI returned an empty study guide.");
    }

    const requiredSections = [
        "KEY CONCEPTS",
        "DEFINITIONS",
        "FORMULAS",
        "COMMON MISTAKES",
        "EXAM QUESTIONS",
        "ADDITIONAL TIPS"
    ];
    const upper = response.toUpperCase();
    const positions = requiredSections.map(section => upper.indexOf(section));
    const missingSections = requiredSections.filter((section, index) => positions[index] === -1);

    if (missingSections.length > 0) {
        throw invalidOutput("The AI study guide did not match the required schema.", {
            missingSections
        });
    }

    if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
        throw invalidOutput("The AI study guide sections were out of order.");
    }
    requiredSections.forEach((section, index) => {
        const start = positions[index] + section.length;
        const end = positions[index + 1] ?? response.length;
        if (!response.slice(start, end).trim()) {
            throw invalidOutput(`The ${section} section was empty.`);
        }
    });

    return response.trim();
}

function validateQuiz(quiz, questionCount) {
    if (!quiz || typeof quiz !== "object" || !Array.isArray(quiz.questions)) {
        throw invalidOutput("The AI quiz did not contain a questions array.");
    }

    if (quiz.questions.length !== questionCount) {
        throw invalidOutput(
            `Expected ${questionCount} questions but received ${quiz.questions.length}.`
        );
    }

    for (const [index, question] of quiz.questions.entries()) {
        const valid = question &&
            typeof question.question === "string" &&
            question.question.trim().length > 0 &&
            question.question.trim().length <= 500 &&
            Array.isArray(question.options) &&
            question.options.length === 4 &&
            question.options.every(option =>
                typeof option === "string" && option.trim().length > 0 && option.trim().length <= 300
            ) &&
            Number.isInteger(question.correctAnswer) &&
            question.correctAnswer >= 0 &&
            question.correctAnswer <= 3 &&
            typeof question.explanation === "string" &&
            question.explanation.trim().length > 0 &&
            question.explanation.trim().length <= 1200;

        if (!valid) {
            throw invalidOutput(`Question ${index + 1} has an invalid schema.`);
        }
        const normalizedOptions = question.options.map(option =>
            option.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
        );
        if (new Set(normalizedOptions).size !== normalizedOptions.length) {
            throw invalidOutput(`Question ${index + 1} contained duplicate answer choices.`);
        }
    }

    const normalizedQuestions = quiz.questions.map(question =>
        question.question.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    );

    if (new Set(normalizedQuestions).size !== normalizedQuestions.length) {
        throw invalidOutput("The AI quiz contained duplicate questions.");
    }

    if (questionCount >= 10) {
        const distribution = [0, 0, 0, 0];
        quiz.questions.forEach(question => distribution[question.correctAnswer]++);

        if (Math.max(...distribution) > Math.ceil(questionCount * 0.6)) {
            throw invalidOutput("Correct-answer positions were poorly distributed.");
        }
    }

    return quiz;
}

function validateVerification(response) {
    const verification = parseJsonResponse(response);
    const validSchema = typeof verification.valid === "boolean" &&
        Array.isArray(verification.issues) &&
        verification.issues.every(issue => typeof issue === "string");

    if (!validSchema) {
        throw invalidOutput("The quiz-verification response had an invalid schema.");
    }

    return verification;
}

function validateFlashcards(payload, cardCount) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.flashcards)) {
        throw invalidOutput("The AI response did not contain a flashcards array.");
    }
    if (payload.flashcards.length !== cardCount) {
        throw invalidOutput(
            `Expected ${cardCount} flashcards but received ${payload.flashcards.length}.`
        );
    }

    const cards = payload.flashcards.map((card, index) => {
        if (
            !card ||
            typeof card.front !== "string" ||
            typeof card.back !== "string" ||
            card.front.trim().length === 0 ||
            card.back.trim().length === 0 ||
            card.front.trim().length > 500 ||
            card.back.trim().length > 2000
        ) {
            throw invalidOutput(`Flashcard ${index + 1} has an invalid schema.`);
        }
        return { front: card.front.trim(), back: card.back.trim() };
    });

    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const keys = cards.map(card => `${normalize(card.front)}\n${normalize(card.back)}`);
    if (new Set(keys).size !== keys.length) {
        throw invalidOutput("The AI response contained duplicate flashcards.");
    }
    const fronts = cards.map(card => normalize(card.front));
    if (new Set(fronts).size !== fronts.length) {
        throw invalidOutput("The AI response contained duplicate flashcard prompts.");
    }
    return cards;
}

function validateAskNotesAnswer(payload) {
    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        typeof payload.answer !== "string" ||
        payload.answer.trim().length === 0 ||
        payload.answer.trim().length > 8000
    ) {
        throw invalidOutput("The AI answer did not match the required schema.");
    }
    return payload.answer.trim();
}

module.exports = {
    parseJsonResponse,
    validateAskNotesAnswer,
    validateFlashcards,
    validateQuiz,
    validateStudyGuide,
    validateVerification
};
