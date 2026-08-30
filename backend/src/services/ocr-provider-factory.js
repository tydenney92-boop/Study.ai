const { createOpenAiOcrProvider } = require("./openai-ocr-provider");

function createConfiguredOcrProvider(config, options = {}) {
    if (!config.ocrEnabled) {
        return { enabled: false, provider: "disabled" };
    }
    if (config.ocrProvider === "openai") {
        if (!config.openAiApiKey || !config.openAiOcrModel) {
            const error = new Error(
                "OPENAI_API_KEY and OPENAI_MODEL_OCR are required when OCR is enabled."
            );
            error.code = "INVALID_OCR_CONFIG";
            throw error;
        }
        return createOpenAiOcrProvider({
            apiKey: config.openAiApiKey,
            model: config.openAiOcrModel,
            timeoutMs: config.ocrTimeoutMs,
            client: options.client,
            onUsage: options.onUsage
        });
    }
    throw new Error(`Unsupported OCR provider: ${config.ocrProvider}`);
}

module.exports = { createConfiguredOcrProvider };
