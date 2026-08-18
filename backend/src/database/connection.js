const Database = require("better-sqlite3");

function createDatabase(databasePath) {
    if (!databasePath) {
        throw new Error("A database path is required.");
    }

    const database = new Database(databasePath);

    database.pragma("foreign_keys = ON");

    return database;
}

module.exports = {
    createDatabase
};
