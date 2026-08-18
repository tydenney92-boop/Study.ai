function createUsersRepository(database) {
    return {
        findByEmail(email) {
            return database.prepare(`
                SELECT id, name, email, password_hash AS passwordHash,
                    created_at AS createdAt
                FROM users
                WHERE email = ? COLLATE NOCASE
            `).get(email);
        },
        findById(id) {
            return database.prepare(`
                SELECT id, name, email, created_at AS createdAt
                FROM users
                WHERE id = ?
            `).get(id);
        },
        create({ name, email, passwordHash }) {
            const result = database.prepare(`
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
            `).run(name, email, passwordHash);
            return this.findById(Number(result.lastInsertRowid));
        },
        setPasswordHash(id, passwordHash, { onlyWhenMissing = false } = {}) {
            const result = database.prepare(`
                UPDATE users
                SET password_hash = ?
                WHERE id = ?
                  AND (? = 0 OR password_hash IS NULL)
            `).run(passwordHash, id, onlyWhenMissing ? 1 : 0);
            return result.changes > 0;
        }
    };
}

module.exports = {
    createUsersRepository
};
