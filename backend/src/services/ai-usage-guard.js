const { AppError } = require("../utils/app-error");

function createAiUsageGuard({ windowMs, maxRequests, maxConcurrentRequests, now = Date.now }) {
    const users = new Map();
    let activeRequests = 0;

    function consumeRateLimit(userId) {
        const timestamp = now();
        const current = users.get(userId);
        const entry = !current || timestamp >= current.resetAt
            ? { count: 0, resetAt: timestamp + windowMs }
            : current;

        if (entry.count >= maxRequests) {
            throw new AppError({
                code: "AI_RATE_LIMIT_EXCEEDED",
                message: "AI generation limit reached. Please try again later.",
                status: 429,
                details: { retryAfterMs: Math.max(0, entry.resetAt - timestamp) }
            });
        }

        entry.count++;
        users.set(userId, entry);
    }

    return {
        async execute(userId, operation) {
            consumeRateLimit(userId);

            if (activeRequests >= maxConcurrentRequests) {
                throw new AppError({
                    code: "AI_CONCURRENCY_LIMIT_EXCEEDED",
                    message: "AI generation is busy. Please try again shortly.",
                    status: 503
                });
            }

            activeRequests++;
            try {
                return await operation();
            } finally {
                activeRequests--;
            }
        }
    };
}

module.exports = { createAiUsageGuard };
