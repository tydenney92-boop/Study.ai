const { AppError } = require("../utils/app-error");

function createAiUsageGuard({
    windowMs,
    maxRequests,
    maxConcurrentRequests,
    now = Date.now,
    namespace = "AI",
    operationLabel = "AI generation"
}) {
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
                code: `${namespace}_RATE_LIMIT_EXCEEDED`,
                message: `${operationLabel} limit reached. Please try again later.`,
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
                    code: `${namespace}_CONCURRENCY_LIMIT_EXCEEDED`,
                    message: `${operationLabel} is busy. Please try again shortly.`,
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
