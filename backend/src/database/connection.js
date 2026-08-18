const Database = require("better-sqlite3");

function createDatabase(databasePath) {
    if (!databasePath) {
        throw new Error("A database path is required.");
    }

    const database = new Database(databasePath);

    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");

    return database;
}

module.exports = {
    createDatabase
};
