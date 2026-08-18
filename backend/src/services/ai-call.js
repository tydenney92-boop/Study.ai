const { AppError } = require("../utils/app-error");

async function callAi(aiClient, prompt) {
    try {
        return await aiClient.generate(prompt);
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
    callAi
};
