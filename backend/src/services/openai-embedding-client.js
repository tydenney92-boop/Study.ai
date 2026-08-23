const OpenAI = require("openai");
const { AppError } = require("../utils/app-error");

function normalizedEmbeddingError(error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError || error?.name === "AbortError") {
        return new AppError({
            code: "EMBEDDING_TIMEOUT",
            message: "The embedding service timed out.",
            status: 504
        });
    }
    if (error instanceof OpenAI.RateLimitError || error?.status === 429) {
        return new AppError({
            code: "EMBEDDING_RATE_LIMITED",
            message: "The embedding service is temporarily rate limited.",
            status: 503
        });
    }
    return new AppError({
        code: "EMBEDDING_SERVICE_ERROR",
        message: "The embedding service is unavailable.",
        status: 502
    });
}

function validVector(value) {
    return Array.isArray(value) && value.length > 0 &&
        value.every(item => Number.isFinite(item));
}

function createOpenAiEmbeddingClient({
    apiKey,
    model,
    dimensions,
    timeoutMs,
    client
}) {
    const openai = client || new OpenAI({
        apiKey,
        timeout: timeoutMs,
        maxRetries: 0
    });

    return {
        provider: "openai",
        model,
        dimensions: dimensions || null,
        async embed(inputs) {
            if (!Array.isArray(inputs) || inputs.length === 0 ||
                inputs.some(input => typeof input !== "string" || input.trim() === "")) {
                throw new AppError({
                    code: "EMBEDDING_INPUT_INVALID",
                    message: "Embedding input must contain non-empty text.",
                    status: 400
                });
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await openai.embeddings.create({
                    model,
                    input: inputs,
                    encoding_format: "float",
                    ...(dimensions ? { dimensions } : {})
                }, {
                    signal: controller.signal,
                    maxRetries: 0
                });
                const ordered = [...(response?.data || [])]
                    .sort((left, right) => left.index - right.index);
                const vectors = ordered.map(item => item.embedding);
                if (vectors.length !== inputs.length || vectors.some(vector => !validVector(vector))) {
                    throw new AppError({
                        code: "EMBEDDING_OUTPUT_INVALID",
                        message: "The embedding service returned invalid vectors.",
                        status: 502
                    });
                }
                const vectorLength = vectors[0].length;
                if (vectors.some(vector => vector.length !== vectorLength)) {
                    throw new AppError({
                        code: "EMBEDDING_OUTPUT_INVALID",
                        message: "The embedding service returned inconsistent dimensions.",
                        status: 502
                    });
                }
                return {
                    vectors,
                    usage: {
                        promptTokens: response?.usage?.prompt_tokens || 0,
                        totalTokens: response?.usage?.total_tokens || 0
                    }
                };
            } catch (error) {
                if (error instanceof AppError) throw error;
                throw normalizedEmbeddingError(error);
            } finally {
                clearTimeout(timeout);
            }
        }
    };
}

module.exports = {
    createOpenAiEmbeddingClient,
    normalizedEmbeddingError,
    validVector
};
