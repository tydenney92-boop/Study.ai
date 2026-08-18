const path = require("path");

const backendRoot = path.resolve(__dirname, "..");

module.exports = {
    port: Number(process.env.PORT) || 3000,
    databasePath:
        process.env.DATABASE_PATH ||
        path.join(backendRoot, "study-ai.db"),
    backupDirectory:
        process.env.DATABASE_BACKUP_DIRECTORY ||
        path.join(backendRoot, "backups"),
    migrationBackup:
        process.env.SKIP_MIGRATION_BACKUP !== "1",
    uploadDirectory:
        process.env.UPLOAD_DIRECTORY ||
        path.join(backendRoot, "uploads"),
    maxUploadBytes:
        Number(process.env.MAX_UPLOAD_BYTES) ||
        20 * 1024 * 1024,
    frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:8080",
    sessionSecret:
        process.env.SESSION_SECRET ||
        (process.env.NODE_ENV === "production"
            ? null
            : "study-ai-local-development-session-secret-change-me"),
    sessionCookieName: process.env.SESSION_COOKIE_NAME || "study_ai_session",
    sessionTtlMs:
        Number(process.env.SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
    secureCookies: process.env.NODE_ENV === "production",
    passwordRounds: Number(process.env.PASSWORD_ROUNDS) || 12,
    ollamaBaseUrl:
        process.env.OLLAMA_BASE_URL ||
        "http://localhost:11434",
    ollamaModel:
        process.env.OLLAMA_MODEL ||
        "llama3.2",
    aiTimeoutMs:
        Number(process.env.AI_TIMEOUT_MS) ||
        120000
};
