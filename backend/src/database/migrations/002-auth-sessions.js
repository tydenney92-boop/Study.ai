function up(database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data_json TEXT NOT NULL CHECK (json_valid(data_json)),
            expires_at INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS sessions_expires_at_idx
            ON sessions(expires_at);
    `);
}

module.exports = {
    id: 2,
    name: "authentication-sessions",
    up
};
