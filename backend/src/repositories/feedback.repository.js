function createFeedbackRepository(database) {
    return {
        create(feedback) {
            const result = database.prepare(`
                INSERT INTO product_feedback (
                    user_id, category, message, page_name, route,
                    viewport_class, app_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                feedback.userId,
                feedback.category,
                feedback.message,
                feedback.pageName,
                feedback.route,
                feedback.viewportClass,
                feedback.appVersion
            );
            return {
                id: Number(result.lastInsertRowid),
                category: feedback.category,
                createdAt: database.prepare(`
                    SELECT created_at AS createdAt FROM product_feedback WHERE id = ?
                `).get(result.lastInsertRowid).createdAt
            };
        },

        dashboard() {
            const counts = Object.fromEntries(database.prepare(`
                SELECT category, COUNT(*) AS count
                FROM product_feedback GROUP BY category
            `).all().map(row => [row.category, row.count]));
            const recent = database.prepare(`
                SELECT id, category, message, page_name AS pageName,
                       viewport_class AS viewportClass, created_at AS createdAt
                FROM product_feedback
                ORDER BY id DESC LIMIT 20
            `).all();
            return {
                total: Object.values(counts).reduce((sum, value) => sum + value, 0),
                counts: {
                    bug: counts.bug || 0,
                    confusing: counts.confusing || 0,
                    featureRequest: counts.feature_request || 0,
                    other: counts.other || 0
                },
                recent
            };
        }
    };
}

module.exports = { createFeedbackRepository };
