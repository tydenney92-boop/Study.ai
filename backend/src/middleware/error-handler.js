function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    console.error(error);

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
