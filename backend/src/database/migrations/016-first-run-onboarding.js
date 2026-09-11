module.exports = {
    id: 16,
    name: "first-run-onboarding",
    up(database) {
        database.exec(`
            CREATE TABLE onboarding_preferences (
                user_id INTEGER PRIMARY KEY,
                welcome_dismissed_at TEXT,
                skipped_at TEXT,
                today_viewed_at TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }
};
