const { getColumnNames } = require("../schema-helpers");

module.exports = {
    id: 3,
    name: "course-last-opened",
    up(database) {
        if (!getColumnNames(database, "courses").includes("last_opened_at")) {
            database.exec(`
                ALTER TABLE courses ADD COLUMN last_opened_at DATETIME
            `);
        }

        database.exec(`
            CREATE INDEX IF NOT EXISTS courses_user_last_opened_idx
                ON courses(user_id, last_opened_at DESC, created_at DESC)
        `);
    }
};
