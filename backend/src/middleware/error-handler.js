const multer = require("multer");

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            error.status = 413;
            error.code = "FILE_TOO_LARGE";
            error.message = "The uploaded file exceeds the size limit.";
            error.expose = true;
        } else {
            error.status = 400;
            error.code = "UPLOAD_ERROR";
            error.message = "The file upload could not be processed.";
            error.expose = true;
        }
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        error.code = "INVALID_JSON";
        error.message = "Request body contains invalid JSON.";
        error.expose = true;
    }

    if ((error.status || 500) >= 500) {
        if (req.app?.locals?.config?.isProduction) {
            console.error(JSON.stringify({
                level: "error",
                event: "request_error",
                requestId: req.requestId,
                code: error.code || "INTERNAL_SERVER_ERROR",
                status: error.status || 500
            }));
        } else {
            console.error(error);
        }
    }

    const response = {
        error: {
            code: error.code || "INTERNAL_SERVER_ERROR",
            message: error.expose
                ? error.message
                : "An unexpected error occurred."
        }
    };

    if (error.details) {
        response.error.details = error.details;
    }

    return res.status(error.status || 500).json(response);
}

module.exports = {
    errorHandler
};
