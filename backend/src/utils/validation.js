const { AppError } = require("./app-error");

function validationError(message, details) {
    return new AppError({
        code: "VALIDATION_ERROR",
        message,
        status: 400,
        details
    });
}

function positiveInteger(value, fieldName) {
    const parsed = typeof value === "number" ? value : Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw validationError(`${fieldName} must be a positive integer.`, {
            field: fieldName
        });
    }

    return parsed;
}

function requestObject(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw validationError("Request body must be a JSON object.");
    }

    return body;
}

function stringField(body, fieldName, options = {}) {
    const value = body[fieldName];

    if (value === undefined && options.optional) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw validationError(`${fieldName} must be a string.`, {
            field: fieldName
        });
    }

    const trimmed = value.trim();

    if (!options.allowEmpty && trimmed.length === 0) {
        throw validationError(`${fieldName} is required.`, {
            field: fieldName
        });
    }

    if (trimmed.length > (options.maxLength || 200)) {
        throw validationError(`${fieldName} is too long.`, {
            field: fieldName
        });
    }

    return trimmed;
}

function requireAtLeastOne(changes) {
    if (Object.values(changes).every(value => value === undefined)) {
        throw validationError("At least one editable field is required.");
    }

    return changes;
}

module.exports = {
    positiveInteger,
    requestObject,
    requireAtLeastOne,
    stringField,
    validationError
};
