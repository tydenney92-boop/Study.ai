const crypto = require("crypto");

function createRequestLogger({ environment = "development", output = console }) {
    return function requestLogger(req, res, next) {
        const started = process.hrtime.bigint();
        const requestId = req.get("x-request-id") || crypto.randomUUID();
        req.requestId = requestId;
        res.set("x-request-id", requestId);

        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
            const record = {
                level: res.statusCode >= 500 ? "error" : "info",
                event: "http_request",
                requestId,
                method: req.method,
                path: req.originalUrl.split("?")[0],
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(1))
            };
            if (environment === "production") output.log(JSON.stringify(record));
        });
        next();
    };
}

module.exports = { createRequestLogger };
