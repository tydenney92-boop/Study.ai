module.exports = {
    id: 17,
    name: "product-analytics",
    up(database) {
        database.exec(`
            CREATE TABLE analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                event_name TEXT NOT NULL CHECK(length(event_name) BETWEEN 1 AND 80),
                course_id INTEGER,
                entity_type TEXT CHECK(entity_type IS NULL OR length(entity_type) BETWEEN 1 AND 40),
                entity_id INTEGER,
                metadata_json TEXT NOT NULL DEFAULT '{}'
                    CHECK(length(metadata_json) <= 1000),
                dedupe_key TEXT CHECK(dedupe_key IS NULL OR length(dedupe_key) BETWEEN 1 AND 100),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL
            );

            CREATE INDEX idx_analytics_events_name_created
                ON analytics_events(event_name, created_at);
            CREATE INDEX idx_analytics_events_user_name
                ON analytics_events(user_id, event_name);
            CREATE INDEX idx_analytics_events_course_created
                ON analytics_events(course_id, created_at);
            CREATE UNIQUE INDEX idx_analytics_events_once
                ON analytics_events(user_id, event_name, dedupe_key)
                WHERE dedupe_key IS NOT NULL;

            CREATE TABLE product_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                category TEXT NOT NULL CHECK(category IN ('bug', 'confusing', 'feature_request', 'other')),
                message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
                page_name TEXT NOT NULL CHECK(length(page_name) BETWEEN 1 AND 80),
                route TEXT NOT NULL CHECK(length(route) BETWEEN 1 AND 120),
                viewport_class TEXT NOT NULL CHECK(viewport_class IN ('mobile', 'tablet', 'desktop')),
                app_version TEXT CHECK(app_version IS NULL OR length(app_version) <= 80),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_product_feedback_created
                ON product_feedback(created_at);
            CREATE INDEX idx_product_feedback_category_created
                ON product_feedback(category, created_at);
        `);
    }
};
