const { createDatabase } = require("./connection");

function createConfiguredDatabase(config) {
    if (config.databaseDriver !== "sqlite") {
        throw new Error(`Unsupported database driver: ${config.databaseDriver}`);
    }
    return createDatabase(config.databasePath);
}

module.exports = { createConfiguredDatabase };
