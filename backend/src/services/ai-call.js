const { AppError } = require("../utils/app-error");

function logAiSelection(aiClient, { workflow, tier, escalated }) {
    if (!aiClient.provider || aiClient.provider === "disabled") return;
    console.log(JSON.stringify({
        level: "info",
        event: "ai_model_selected",
        workflow,
        provider: aiClient.provider,
        tier,
        escalated: Boolean(escalated)
    }));
}

async function callAi(aiClient, prompt, options = {}) {
    const selection = {
        workflow: options.workflow || "unspecified",
        tier: options.tier || "standard",
        escalated: Boolean(options.escalated)
    };
    try {
        logAiSelection(aiClient, selection);
        return await aiClient.generate(prompt, selection);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError({
            code: "AI_SERVICE_ERROR",
            message: "The AI service could not complete the request.",
            status: 502,
            details: { reason: error.message }
        });
    }
}

module.exports = {
    callAi,
    logAiSelection
};
