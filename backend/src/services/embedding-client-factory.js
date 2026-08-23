const { createOpenAiEmbeddingClient } = require("./openai-embedding-client");

function createConfiguredEmbeddingClient(config, options = {}) {
    if (!config.embeddingsEnabled) return null;
    if (config.embeddingsProvider === "openai") {
        if (!config.openAiApiKey || !config.openAiEmbeddingModel) {
            const error = new Error(
                "OPENAI_API_KEY and OPENAI_EMBEDDING_MODEL are required when embeddings are enabled."
            );
            error.code = "INVALID_EMBEDDING_CONFIG";
            throw error;
        }
        return createOpenAiEmbeddingClient({
            apiKey: config.openAiApiKey,
            model: config.openAiEmbeddingModel,
            dimensions: config.openAiEmbeddingDimensions,
            timeoutMs: config.embeddingTimeoutMs,
            client: options.openAiClient
        });
    }
    throw new Error(`Unsupported embedding provider: ${config.embeddingsProvider}`);
}

module.exports = { createConfiguredEmbeddingClient };
