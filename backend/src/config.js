const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");
const { validateProductionConfig } = require("./config/validate-config");

const environment = process.env.NODE_ENV || "development";
const isProduction = environment === "production";

function booleanEnvironment(name, defaultValue) {
    if (process.env[name] === undefined) return defaultValue;
    return process.env[name] === "1" || process.env[name] === "true";
}

function numberEnvironment(name, defaultValue) {
    if (process.env[name] === undefined) return defaultValue;
    return Number(process.env[name]);
}

const config = {
    environment,
    isProduction,
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
    appOrigin: process.env.APP_ORIGIN || (isProduction ? null : "http://localhost:8080"),
    frontendOrigin: process.env.FRONTEND_ORIGIN || (isProduction ? null : "http://localhost:8080"),
    frontendDirectory: process.env.FRONTEND_DIRECTORY || projectRoot,
    serveFrontend: booleanEnvironment("SERVE_FRONTEND", isProduction),
    databaseDriver: process.env.DATABASE_DRIVER || (isProduction ? null : "sqlite"),
    databasePath:
        process.env.DATABASE_PATH ||
        (isProduction ? null : path.join(backendRoot, "study-ai.db")),
    backupDirectory:
        process.env.DATABASE_BACKUP_DIRECTORY ||
        (isProduction ? null : path.join(backendRoot, "backups")),
    migrationBackup:
        process.env.SKIP_MIGRATION_BACKUP !== "1",
    uploadDirectory:
        process.env.UPLOAD_DIRECTORY ||
        (isProduction ? null : path.join(backendRoot, "uploads")),
    storageDriver: process.env.STORAGE_DRIVER || (isProduction ? null : "local"),
    objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET || null,
    objectStorageRegion: process.env.OBJECT_STORAGE_REGION || null,
    objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT || null,
    objectStorageAccessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || null,
    objectStorageSecretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || null,
    objectStorageForcePathStyle: booleanEnvironment("OBJECT_STORAGE_FORCE_PATH_STYLE", false),
    maxUploadBytes:
        Number(process.env.MAX_UPLOAD_BYTES) ||
        20 * 1024 * 1024,
    sessionSecret:
        process.env.SESSION_SECRET ||
        (isProduction
            ? null
            : "study-ai-local-development-session-secret-change-me"),
    sessionCookieName: process.env.SESSION_COOKIE_NAME || "study_ai_session",
    sessionTtlMs:
        Number(process.env.SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
    secureCookies: booleanEnvironment("SECURE_COOKIES", isProduction),
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS) || (isProduction ? 1 : 0),
    passwordRounds: Number(process.env.PASSWORD_ROUNDS) || 12,
    aiProvider: process.env.AI_PROVIDER || (isProduction ? null : "ollama"),
    aiEnabled: isProduction && process.env.AI_ENABLED === undefined
        ? null
        : booleanEnvironment("AI_ENABLED", true),
    ollamaBaseUrl:
        process.env.OLLAMA_BASE_URL ||
        (isProduction ? null : "http://localhost:11434"),
    ollamaModel:
        process.env.OLLAMA_MODEL ||
        (isProduction ? null : "llama3.2"),
    openAiApiKey: process.env.OPENAI_API_KEY || null,
    openAiModel: process.env.OPENAI_MODEL || null,
    aiTimeoutMs:
        numberEnvironment("AI_TIMEOUT_MS", 120000),
    aiRateLimitWindowMs:
        numberEnvironment("AI_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000),
    aiRateLimitMaxRequests:
        numberEnvironment("AI_RATE_LIMIT_MAX_REQUESTS", 5),
    aiMaxConcurrentRequests:
        numberEnvironment("AI_MAX_CONCURRENT_REQUESTS", 2),
    aiMaxContextCharacters:
        numberEnvironment("AI_MAX_CONTEXT_CHARACTERS", 100000),
    aiQuizMinQuestions:
        numberEnvironment("AI_QUIZ_MIN_QUESTIONS", 5),
    aiQuizMaxQuestions:
        numberEnvironment("AI_QUIZ_MAX_QUESTIONS", 20),
    aiQuizMaxAttempts:
        numberEnvironment("AI_QUIZ_MAX_ATTEMPTS", 3)
};

module.exports = isProduction ? validateProductionConfig(config) : config;
