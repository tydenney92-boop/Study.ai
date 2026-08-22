function quiz(questionCount) {
    return {
        questions: Array.from({ length: questionCount }, (_, index) => ({
            question: `What does the selected material say about concept ${index + 1}?`,
            options: [
                `Supported answer ${index + 1}`,
                `Distractor ${index + 1}B`,
                `Distractor ${index + 1}C`,
                `Distractor ${index + 1}D`
            ],
            correctAnswer: 0,
            explanation: `The selected material supports answer ${index + 1}.`
        }))
    };
}

function flashcards(cardCount) {
    return {
        flashcards: Array.from({ length: cardCount }, (_, index) => ({
            front: `Generated concept ${index + 1}?`,
            back: `Grounded answer ${index + 1}`
        }))
    };
}

function createFakeAiClient() {
    const counts = { total: 0, studyGuide: 0, quiz: 0, verification: 0, flashcards: 0, askNotes: 0 };

    return {
        counts,
        reset() {
            Object.keys(counts).forEach(key => { counts[key] = 0; });
        },
        async generate(prompt) {
            counts.total++;
            if (prompt.includes("strict second-pass quiz verifier")) {
                counts.verification++;
                return JSON.stringify({ valid: true, issues: [] });
            }
            if (prompt.includes('"questions"')) {
                counts.quiz++;
                const questionCount = Number(prompt.match(/EXACTLY (\d+) questions/)?.[1] || 5);
                return JSON.stringify(quiz(questionCount));
            }
            if (prompt.includes('"flashcards"')) {
                counts.flashcards++;
                const cardCount = Number(prompt.match(/EXACTLY (\d+) concise flashcards/)?.[1] || 5);
                return JSON.stringify(flashcards(cardCount));
            }
            if (prompt.includes('"answer"')) {
                counts.askNotes++;
                if (/force service error/i.test(prompt)) {
                    throw new Error("Deterministic fake AI failure");
                }
                const unavailable = /missing from my notes|unsupported answer/i.test(prompt);
                return JSON.stringify({
                    answer: unavailable
                        ? "The selected materials do not contain enough information."
                        : "The selected notes explain that supply and demand interact to determine market outcomes.",
                    supportType: unavailable ? "not_found" : "grounded_with_explanation"
                });
            }
            counts.studyGuide++;
            return [
                "KEY CONCEPTS\n1. Supply and demand interact in markets.",
                "DEFINITIONS\n1. Demand is willingness and ability to buy.",
                "FORMULAS\n1. The selected notes provide no formula.",
                "COMMON MISTAKES\n1. Do not confuse a shift with movement along a curve.",
                "EXAM QUESTIONS\n1. What factors shift demand?",
                "ADDITIONAL TIPS\n1. Practice explaining each curve shift."
            ].join("\n");
        }
    };
}

module.exports = { createFakeAiClient };
