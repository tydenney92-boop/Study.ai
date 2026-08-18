const bcrypt = require("bcryptjs");
const config = require("../config");
const { createDatabase } = require("./connection");
const { runMigrations } = require("./migration-runner");
const { createUsersRepository } = require("../repositories/users.repository");

const email = "development@study.ai";
const password = process.env.DEVELOPMENT_USER_PASSWORD;

if (!password || password.length < 8) {
    throw new Error(
        "Set DEVELOPMENT_USER_PASSWORD to at least 8 characters before running this command."
    );
}

const database = createDatabase(config.databasePath);

try {
    runMigrations({
        database,
        databasePath: config.databasePath,
        backupDirectory: config.backupDirectory,
        createBackup: config.migrationBackup
    });
    const users = createUsersRepository(database);
    const user = users.findByEmail(email);
    if (!user) throw new Error("The seeded development user was not found.");
    if (user.passwordHash) {
        console.log("The seeded development user already has a password; no change made.");
    } else {
        const hash = bcrypt.hashSync(password, config.passwordRounds);
        users.setPasswordHash(user.id, hash, { onlyWhenMissing: true });
        console.log("The seeded development user can now log in with development@study.ai.");
    }
} finally {
    database.close();
}
