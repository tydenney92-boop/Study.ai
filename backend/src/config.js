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
    ollamaBaseUrl:
        process.env.OLLAMA_BASE_URL ||
        "http://localhost:11434",
    ollamaModel:
        process.env.OLLAMA_MODEL ||
        "llama3.2"
};
