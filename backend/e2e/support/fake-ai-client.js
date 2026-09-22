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
            if (prompt.includes("LEGACY_MATH_FIXTURE")) {
                return [
                    "KEY CONCEPTS\n1. **Comparative Advantage**\nSpecialize where opportunity cost is lower.",
                    "DEFINITIONS\n1. **Terms of Trade** — the rate at which goods exchange.",
                    "FORMULAS\n1. **Legacy relative price**\n- \\\[\n- \\frac{p_X^W}{p_Y^W}\n- \\\]",
                    "COMMON MISTAKES\n1. **Mistake:** Reading the equation as three bullets.\n**Correct rule:** Treat it as one display equation.",
                    "EXAM QUESTIONS\n1. **Question:** Identify the relative price.\n**Answer:** Use the displayed ratio.",
                    "ADDITIONAL TIPS\n1. Practice translating notation into words."
                ].join("\n");
            }
            return [
                "KEY CONCEPTS\n1. **Marginal Rate of Substitution (MRS)**\nSupply and demand interact in markets. Home produces good \\(X\\), and consumer equilibrium requires \\(MRS = MRT\\).",
                "DEFINITIONS\n1. **Comparative Advantage** — the ability to produce at a lower opportunity cost.\n2. **Terms of Trade** — the world relative price \\(\\frac{p_X^W}{p_Y^W}\\).",
                "FORMULAS\n1. **Consumer Equilibrium**\n\\[\nMRS=\\frac{MU_X}{MU_Y}=\\frac{p_X}{p_Y}\n\\]\nUse this at an interior optimum.\n2. **Production Possibility Frontier**\n\\[\nMRT=-\\frac{dY}{dX}\n\\]\nThis is the opportunity cost at the production margin.\n3. **Cobb-Douglas Utility**\n\\[\nU=X^\\gamma Y^{1-\\gamma}\n\\]",
                "COMMON MISTAKES\n1. **Mistake:** Using \\(MRS=MRT\\) under free trade.\n**Correct rule:** Production uses \\(MRT=p^W\\), while consumption uses \\(MRS=p^W\\).",
                "EXAM QUESTIONS\n1. **Question:** If \\(X^P>X^C\\), what does the economy export?\n**Answer:** It exports good \\(X\\).\n2. **Worked Example — Guyana Autarky**\n**Given:** \\(U=X^{0.2}Y^{0.8}\\) and \\(4X^2+Y^2=80\\).\n**Step 1:** Find MRT.\n\\[MRT=\\frac{4X}{Y}\\]\n**Step 2:** Set MRS equal to MRT.\n**Result:** \\(X=2\\), \\(Y=8\\).",
                "ADDITIONAL TIPS\n1. Practice explaining each curve shift."
            ].join("\n");
        }
    };
}

module.exports = { createFakeAiClient };
