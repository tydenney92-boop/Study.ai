function createUsersRepository(database) {
    return {
        findByEmail(email) {
            return database.prepare(`
                SELECT id, name, email, created_at AS createdAt
                FROM users
                WHERE email = ? COLLATE NOCASE
            `).get(email);
        }
    };
}

module.exports = {
    createUsersRepository
};
