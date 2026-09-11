module.exports = {
    id: 17,
    name: "live-canvas-connection",
    up(database) {
        database.exec(`
            ALTER TABLE course_tasks ADD COLUMN external_submission_type TEXT
                CHECK(external_submission_type IS NULL OR length(external_submission_type) <= 50);
        `);
    }
};
