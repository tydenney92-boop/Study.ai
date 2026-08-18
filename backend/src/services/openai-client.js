const OpenAI = require("openai");
const { AppError } = require("../utils/app-error");

function normalizedOpenAiError(error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError || error?.name === "AbortError") {
        return new AppError({
            code: "AI_TIMEOUT",
            message: "The AI service timed out.",
            status: 504
        });
    }

    if (error instanceof OpenAI.RateLimitError || error?.status === 429) {
        return new AppError({
            code: "AI_RATE_LIMITED",
            message: "The AI service is temporarily rate limited.",
            status: 503
        });
    }

    return new AppError({
        code: "AI_SERVICE_ERROR",
        message: "The AI service is unavailable.",
        status: 502
    });
}

function createOpenAiClient({ apiKey, model, timeoutMs, client }) {
    const openai = client || new OpenAI({
        apiKey,
        timeout: timeoutMs,
        maxRetries: 0
    });

    return {
        async generate(prompt) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await openai.responses.create({
                    model,
                    input: prompt
                }, {
                    signal: controller.signal,
                    maxRetries: 0
                });

                if (!response || typeof response.output_text !== "string" ||
                    response.output_text.trim() === "") {
                    throw new AppError({
                        code: "AI_OUTPUT_INVALID",
                        message: "The AI service returned an invalid response.",
                        status: 502
                    });
                }

                return response.output_text;
            } catch (error) {
                if (error instanceof AppError) throw error;
                throw normalizedOpenAiError(error);
            } finally {
                clearTimeout(timeout);
            }
        }
    };
}

module.exports = { createOpenAiClient, normalizedOpenAiError };
