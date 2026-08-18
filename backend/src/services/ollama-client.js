const { AppError } = require("../utils/app-error");

function createOllamaClient({ baseUrl, model, timeoutMs }) {
    return {
        async generate(prompt) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            let response;

            try {
                response = await fetch(
                    `${baseUrl}/api/generate`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model,
                            prompt,
                            stream: false
                        }),
                        signal: controller.signal
                    }
                );
            } catch (error) {
                if (error.name === "AbortError") {
                    throw new AppError({
                        code: "AI_TIMEOUT",
                        message: "The AI service timed out.",
                        status: 504
                    });
                }

                throw new AppError({
                    code: "AI_SERVICE_ERROR",
                    message: "The AI service is unavailable.",
                    status: 502
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                throw new AppError({
                    code: "AI_SERVICE_ERROR",
                    message: "The AI service returned an error.",
                    status: 502,
                    details: { upstreamStatus: response.status }
                });
            }

            const data = await response.json();

            if (!data || typeof data.response !== "string") {
                throw new AppError({
                    code: "AI_OUTPUT_INVALID",
                    message: "The AI service returned an invalid response.",
                    status: 502
                });
            }

            return data.response;
        }
    };
}

module.exports = {
    createOllamaClient
};
