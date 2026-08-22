const { createOllamaClient } = require("./ollama-client");
const { createOpenAiClient } = require("./openai-client");
const { AppError } = require("../utils/app-error");

function createConfiguredAiClient(config) {
    if (!config.aiEnabled) {
        return {
            provider: "disabled",
            async generate() {
                throw new AppError({
                    code: "AI_DISABLED",
                    message: "AI generation is not configured for this deployment.",
                    status: 503
                });
            }
        };
    }
    if (config.aiProvider === "ollama") {
        return createOllamaClient({
            baseUrl: config.ollamaBaseUrl,
            model: config.ollamaModel,
            timeoutMs: config.aiTimeoutMs
        });
    }
    if (config.aiProvider === "openai") {
        return createOpenAiClient({
            apiKey: config.openAiApiKey,
            models: {
                fast: config.openAiModels?.fast || config.openAiModel,
                standard: config.openAiModels?.standard || config.openAiModel,
                advanced: config.openAiModels?.advanced || config.openAiModel
            },
            timeoutMs: config.aiTimeoutMs
        });
    }
    throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
}

module.exports = { createConfiguredAiClient };
