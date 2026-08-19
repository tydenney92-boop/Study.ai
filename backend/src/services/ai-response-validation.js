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
    const missingSections = requiredSections.filter(
        section => !response.includes(section)
    );

    if (missingSections.length > 0) {
        throw invalidOutput("The AI study guide did not match the required schema.", {
            missingSections
        });
    }

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
            Array.isArray(question.options) &&
            question.options.length === 4 &&
            question.options.every(option =>
                typeof option === "string" && option.trim().length > 0
            ) &&
            Number.isInteger(question.correctAnswer) &&
            question.correctAnswer >= 0 &&
            question.correctAnswer <= 3 &&
            typeof question.explanation === "string" &&
            question.explanation.trim().length > 0;

        if (!valid) {
            throw invalidOutput(`Question ${index + 1} has an invalid schema.`);
        }
    }

    const normalizedQuestions = quiz.questions.map(question =>
        question.question.trim().toLowerCase()
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

    const keys = cards.map(card =>
        `${card.front.toLowerCase()}\n${card.back.toLowerCase()}`
    );
    if (new Set(keys).size !== keys.length) {
        throw invalidOutput("The AI response contained duplicate flashcards.");
    }
    return cards;
}

module.exports = {
    parseJsonResponse,
    validateFlashcards,
    validateQuiz,
    validateStudyGuide,
    validateVerification
};
