function createOnboardingRepository(database) {
    function find(userId) {
        return database.prepare(`
            SELECT user_id AS userId,
                   welcome_dismissed_at AS welcomeDismissedAt,
                   skipped_at AS skippedAt,
                   today_viewed_at AS todayViewedAt,
                   updated_at AS updatedAt
            FROM onboarding_preferences
            WHERE user_id = ?
        `).get(userId) || {
            userId,
            welcomeDismissedAt: null,
            skippedAt: null,
            todayViewedAt: null,
            updatedAt: null
        };
    }

    function ensure(userId) {
        database.prepare(`
            INSERT OR IGNORE INTO onboarding_preferences (user_id)
            VALUES (?)
        `).run(userId);
    }

    return {
        find,
        dismissWelcome(userId) {
            ensure(userId);
            database.prepare(`
                UPDATE onboarding_preferences
                SET welcome_dismissed_at = COALESCE(welcome_dismissed_at, CURRENT_TIMESTAMP),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(userId);
            return find(userId);
        },
        skip(userId) {
            ensure(userId);
            database.prepare(`
                UPDATE onboarding_preferences
                SET welcome_dismissed_at = COALESCE(welcome_dismissed_at, CURRENT_TIMESTAMP),
                    skipped_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(userId);
            return find(userId);
        },
        resume(userId) {
            ensure(userId);
            database.prepare(`
                UPDATE onboarding_preferences
                SET skipped_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(userId);
            return find(userId);
        },
        markTodayViewed(userId) {
            ensure(userId);
            database.prepare(`
                UPDATE onboarding_preferences
                SET today_viewed_at = COALESCE(today_viewed_at, CURRENT_TIMESTAMP),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(userId);
            return find(userId);
        }
    };
}

module.exports = { createOnboardingRepository };
