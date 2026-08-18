const fs = require("fs");
const path = require("path");
const { createDatabase } = require("./connection");

function createConfiguredDatabase(config) {
    if (config.databaseDriver !== "sqlite") {
        throw new Error(`Unsupported database driver: ${config.databaseDriver}`);
    }

    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    fs.mkdirSync(config.backupDirectory, { recursive: true });

    if (config.storageDriver === "local") {
        fs.mkdirSync(config.uploadDirectory, { recursive: true });
    }

    return createDatabase(config.databasePath);
}

module.exports = { createConfiguredDatabase };
