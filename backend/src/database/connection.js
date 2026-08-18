const Database = require("better-sqlite3");

function createDatabase(databasePath) {
    if (!databasePath) {
        throw new Error("A database path is required.");
    }

    return new Database(databasePath);
}

module.exports = {
    createDatabase
};
