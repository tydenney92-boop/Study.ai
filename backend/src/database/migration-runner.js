const migration001 = require("./migrations/001-multi-user-schema");
const migration002 = require("./migrations/002-auth-sessions");
const migration003 = require("./migrations/003-course-last-opened");
const { tableExists } = require("./schema-helpers");
const { createVerifiedBackup } = require("./sqlite-backup");

const migrations = [migration001, migration002, migration003];

function appliedMigrationIds(database) {
    if (!tableExists(database, "schema_migrations")) {
        return new Set();
    }

    return new Set(
        database
            .prepare("SELECT id FROM schema_migrations")
            .all()
            .map(row => row.id)
    );
}

function runMigrations({
    database,
    databasePath,
    backupDirectory,
    createBackup = true
}) {
    const applied = appliedMigrationIds(database);
    const pending = migrations.filter(migration => !applied.has(migration.id));

    if (pending.length === 0) {
        return {
            applied: [],
            backupPath: null
        };
    }

    const backupPath = createBackup
        ? createVerifiedBackup({
            database,
            databasePath,
            backupDirectory
        })
        : null;

    database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const applyMigration = database.transaction(migration => {
        migration.up(database);

        const violations = database.pragma("foreign_key_check");

        if (violations.length > 0) {
            throw new Error(
                `Migration ${migration.id} produced foreign-key violations.`
            );
        }

        database.prepare(`
            INSERT INTO schema_migrations (id, name)
            VALUES (?, ?)
        `).run(migration.id, migration.name);
    });

    const newlyApplied = [];

    for (const migration of pending) {
        applyMigration(migration);
        newlyApplied.push(migration.id);
    }

    return {
        applied: newlyApplied,
        backupPath
    };
}

module.exports = {
    migrations,
    runMigrations
};
