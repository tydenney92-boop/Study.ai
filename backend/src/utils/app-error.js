class AppError extends Error {
    constructor({ code, message, status = 500, details, expose = true }) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.details = details;
        this.expose = expose;
    }
}

module.exports = {
    AppError
};
