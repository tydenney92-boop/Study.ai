const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function timestampForFilename(date = new Date()) {
    return date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")
        .replace("T", "-");
}

function createVerifiedBackup({ database, databasePath, backupDirectory }) {
    if (!databasePath || databasePath === ":memory:") {
        return null;
    }

    if (!fs.existsSync(databasePath)) {
        return null;
    }

    fs.mkdirSync(backupDirectory, { recursive: true });

    database.pragma("wal_checkpoint(FULL)");

    const backupPath = path.join(
        backupDirectory,
        `study-ai-pre-migration-${timestampForFilename()}.db`
    );

    fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);

    const backupDatabase = new Database(backupPath, {
        readonly: true,
        fileMustExist: true
    });

    try {
        const result = backupDatabase.pragma("integrity_check", {
            simple: true
        });

        if (result !== "ok") {
            throw new Error(`Backup integrity check failed: ${result}`);
        }
    } finally {
        backupDatabase.close();
    }

    return backupPath;
}

module.exports = {
    createVerifiedBackup,
    timestampForFilename
};
