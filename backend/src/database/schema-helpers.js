function tableExists(database, tableName) {
    return Boolean(
        database.prepare(`
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
        `).get(tableName)
    );
}

function getColumnNames(database, tableName) {
    if (!tableExists(database, tableName)) {
        return [];
    }

    return database
        .prepare(`PRAGMA table_info(${tableName})`)
        .all()
        .map(column => column.name);
}

module.exports = {
    getColumnNames,
    tableExists
};
