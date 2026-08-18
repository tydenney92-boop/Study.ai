const { createOllamaClient } = require("./ollama-client");
const { AppError } = require("../utils/app-error");

function createConfiguredAiClient(config) {
    if (!config.aiEnabled) {
        return {
            async generate() {
                throw new AppError({
                    code: "AI_DISABLED",
                    message: "AI generation is not configured for this deployment.",
                    status: 503
                });
            }
        };
    }
    if (config.aiProvider !== "ollama") {
        throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
    }
    return createOllamaClient({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
        timeoutMs: config.aiTimeoutMs
    });
}

module.exports = { createConfiguredAiClient };
