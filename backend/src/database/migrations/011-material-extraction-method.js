const { getColumnNames } = require("../schema-helpers");

module.exports = {
    id: 11,
    name: "material-extraction-method",
    up(database) {
        const columns = getColumnNames(database, "materials");
        if (!columns.includes("extraction_method")) {
            database.exec(`
                ALTER TABLE materials ADD COLUMN extraction_method TEXT
                    CHECK (
                        extraction_method IS NULL OR
                        extraction_method IN ('native', 'ocr')
                    )
            `);
        }
        database.exec(`
            UPDATE materials
            SET extraction_method = 'native'
            WHERE extraction_status = 'extracted'
              AND extraction_method IS NULL
        `);
    }
};
