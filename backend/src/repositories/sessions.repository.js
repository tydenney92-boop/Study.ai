function createSessionsRepository(database) {
    const findStatement = database.prepare(`
        SELECT data_json AS dataJson, expires_at AS expiresAt
        FROM sessions
        WHERE sid = ? AND expires_at > ?
    `);
    const upsertStatement = database.prepare(`
        INSERT INTO sessions (sid, data_json, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET
            data_json = excluded.data_json,
            expires_at = excluded.expires_at,
            updated_at = CURRENT_TIMESTAMP
    `);

    return {
        find(sid, now = Date.now()) {
            return findStatement.get(sid, now);
        },
        upsert(sid, session, expiresAt) {
            upsertStatement.run(sid, JSON.stringify(session), expiresAt);
        },
        delete(sid) {
            database.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        },
        deleteExpired(now = Date.now()) {
            database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
        },
        clear() {
            database.prepare("DELETE FROM sessions").run();
        },
        touch(sid, expiresAt) {
            database.prepare(`
                UPDATE sessions
                SET expires_at = ?, updated_at = CURRENT_TIMESTAMP
                WHERE sid = ?
            `).run(expiresAt, sid);
        }
    };
}

module.exports = { createSessionsRepository };
