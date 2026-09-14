const { getColumnNames } = require("../schema-helpers");

module.exports = {
    id: 18,
    name: "demo-users",
    up(database) {
        if (!getColumnNames(database, "users").includes("is_demo")) {
            database.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))");
        }
        database.exec("CREATE INDEX IF NOT EXISTS users_demo_created_idx ON users(is_demo, created_at)");
    }
};
