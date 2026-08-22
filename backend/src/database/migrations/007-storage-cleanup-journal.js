module.exports = {
    id: 7,
    name: "storage-cleanup-journal",
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                stored_filename TEXT NOT NULL UNIQUE,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_user
                ON storage_cleanup_jobs(user_id, created_at, id);
        `);
    }
};
