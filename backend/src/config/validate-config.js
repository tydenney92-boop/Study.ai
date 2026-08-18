const path = require("path");

function required(value, name, errors) {
    if (value === undefined || value === null || value === "") {
        errors.push(`${name} is required.`);
    }
}

function validateProductionConfig(config) {
    const errors = [];
    required(config.appOrigin, "APP_ORIGIN", errors);
    required(config.sessionSecret, "SESSION_SECRET", errors);
    required(config.databasePath, "DATABASE_PATH", errors);
    required(config.databaseDriver, "DATABASE_DRIVER", errors);
    required(config.backupDirectory, "DATABASE_BACKUP_DIRECTORY", errors);
    required(config.storageDriver, "STORAGE_DRIVER", errors);
    required(config.aiProvider, "AI_PROVIDER", errors);

    if (config.sessionSecret && config.sessionSecret.length < 32) {
        errors.push("SESSION_SECRET must contain at least 32 characters.");
    }
    if (!config.secureCookies) {
        errors.push("SECURE_COOKIES must be enabled in production.");
    }
    if (!Number.isInteger(config.trustProxyHops) || config.trustProxyHops < 1) {
        errors.push("TRUST_PROXY_HOPS must be at least 1 in production.");
    }
    if (!config.serveFrontend) {
        errors.push("SERVE_FRONTEND must be enabled for the single-domain deployment.");
    }
    if (config.appOrigin && !/^https:\/\//i.test(config.appOrigin)) {
        errors.push("APP_ORIGIN must use HTTPS in production.");
    }
    if (config.databaseDriver && config.databaseDriver !== "sqlite") {
        errors.push("DATABASE_DRIVER currently supports only sqlite.");
    }
    if (config.databasePath && !path.isAbsolute(config.databasePath)) {
        errors.push("DATABASE_PATH must be absolute in production.");
    }
    if (config.backupDirectory && !path.isAbsolute(config.backupDirectory)) {
        errors.push("DATABASE_BACKUP_DIRECTORY must be absolute in production.");
    }
    if (config.storageDriver === "local") {
        required(config.uploadDirectory, "UPLOAD_DIRECTORY", errors);
        if (config.uploadDirectory && !path.isAbsolute(config.uploadDirectory)) {
            errors.push("UPLOAD_DIRECTORY must be an absolute persistent path.");
        }
    } else if (config.storageDriver === "s3") {
        required(config.objectStorageBucket, "OBJECT_STORAGE_BUCKET", errors);
        required(config.objectStorageRegion, "OBJECT_STORAGE_REGION", errors);
    } else if (config.storageDriver) {
        errors.push("STORAGE_DRIVER must be local or s3.");
    }
    if (Boolean(config.objectStorageAccessKeyId) !== Boolean(config.objectStorageSecretAccessKey)) {
        errors.push("Object-storage access key and secret must be provided together.");
    }
    if (config.aiProvider && config.aiProvider !== "ollama") {
        errors.push("AI_PROVIDER currently supports only ollama.");
    }
    if (config.aiEnabled) {
        required(config.ollamaBaseUrl, "OLLAMA_BASE_URL", errors);
        required(config.ollamaModel, "OLLAMA_MODEL", errors);
    }

    if (errors.length > 0) {
        const error = new Error(`Invalid production configuration: ${errors.join(" ")}`);
        error.code = "INVALID_PRODUCTION_CONFIG";
        throw error;
    }
    return config;
}

module.exports = { validateProductionConfig };
