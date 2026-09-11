function createAnalyticsRepository(database) {
    return {
        create(event) {
            const result = database.prepare(`
                INSERT OR IGNORE INTO analytics_events (
                    user_id, event_name, course_id, entity_type, entity_id,
                    metadata_json, dedupe_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                event.userId,
                event.eventName,
                event.courseId,
                event.entityType,
                event.entityId,
                event.metadataJson,
                event.dedupeKey
            );
            return result.changes > 0;
        },

        listOwned(userId) {
            return database.prepare(`
                SELECT id, event_name AS eventName, course_id AS courseId,
                       entity_type AS entityType, entity_id AS entityId,
                       metadata_json AS metadataJson, created_at AS createdAt
                FROM analytics_events
                WHERE user_id = ?
                ORDER BY id
            `).all(userId).map(event => ({
                ...event,
                metadata: JSON.parse(event.metadataJson)
            }));
        },

        dashboard() {
            const eventCounts = Object.fromEntries(database.prepare(`
                SELECT event_name AS eventName, COUNT(*) AS count
                FROM analytics_events
                GROUP BY event_name
            `).all().map(row => [row.eventName, row.count]));
            const users = database.prepare(`SELECT COUNT(*) AS count FROM users`).get().count;
            const newUsers = database.prepare(`
                SELECT COUNT(*) AS count FROM users
                WHERE datetime(created_at) >= datetime('now', '-30 days')
            `).get().count;
            const activeUsers = database.prepare(`
                SELECT COUNT(DISTINCT user_id) AS count FROM analytics_events
                WHERE datetime(created_at) >= datetime('now', '-30 days')
            `).get().count;
            const distinctEventUsers = database.prepare(`
                SELECT event_name AS eventName, COUNT(DISTINCT user_id) AS count
                FROM analytics_events GROUP BY event_name
            `).all();
            const eventUsers = Object.fromEntries(distinctEventUsers.map(row => [row.eventName, row.count]));
            const scalar = sql => database.prepare(sql).get().count;
            const adoptionCounts = {
                course: scalar(`SELECT COUNT(DISTINCT user_id) AS count FROM courses`),
                material: scalar(`
                    SELECT COUNT(DISTINCT courses.user_id) AS count
                    FROM materials JOIN courses ON courses.id = materials.course_id
                `),
                syllabusImport: scalar(`
                    SELECT COUNT(DISTINCT courses.user_id) AS count
                    FROM course_tasks JOIN courses ON courses.id = course_tasks.course_id
                    WHERE course_tasks.schedule_source_material_id IS NOT NULL
                `),
                plannerTask: scalar(`
                    SELECT COUNT(DISTINCT courses.user_id) AS count
                    FROM course_tasks JOIN courses ON courses.id = course_tasks.course_id
                `),
                quizCompleted: eventUsers.quiz_completed || 0,
                flashcardsReviewed: eventUsers.flashcards_reviewed || 0,
                todayOpened: eventUsers.today_opened || 0
            };
            const percent = count => users ? Math.round(count / users * 1000) / 10 : 0;
            const funnelNames = [
                "signup", "course_created", "syllabus_uploaded",
                "syllabus_import_completed", "study_activity_completed", "today_opened"
            ];
            return {
                generatedAt: new Date().toISOString(),
                users: { total: users, newLast30Days: newUsers, activeLast30Days: activeUsers },
                onboardingCompletionRate: percent(eventUsers.onboarding_completed || 0),
                eventCounts,
                funnel: funnelNames.map(eventName => ({
                    eventName,
                    users: eventUsers[eventName] || 0
                })),
                adoption: Object.fromEntries(Object.entries(adoptionCounts).map(([key, count]) => [
                    key, { users: count, percent: percent(count) }
                ]))
            };
        }
    };
}

module.exports = { createAnalyticsRepository };
