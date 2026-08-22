const { getColumnNames, tableExists } = require("../schema-helpers");

module.exports = {
    id: 6,
    name: "material-display-name",
    up(database) {
        if (!tableExists(database, "materials")) {
            return;
        }

        const columns = getColumnNames(database, "materials");
        if (!columns.includes("display_name")) {
            database.exec("ALTER TABLE materials ADD COLUMN display_name TEXT");
        }

        database.exec(`
            UPDATE materials
            SET display_name = original_filename
            WHERE display_name IS NULL OR trim(display_name) = ''
        `);
    }
};
