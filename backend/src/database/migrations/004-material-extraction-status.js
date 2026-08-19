const { getColumnNames } = require("../schema-helpers");

module.exports = {
    id: 4,
    name: "material-extraction-status",
    up(database) {
        const needsBackfill = !getColumnNames(database, "materials")
            .includes("extraction_status");
        if (needsBackfill) {
            database.exec(`
                ALTER TABLE materials ADD COLUMN extraction_status TEXT NOT NULL
                    DEFAULT 'no_text'
                    CHECK (extraction_status IN (
                        'extracted', 'no_text', 'unsupported', 'failed'
                    ))
            `);
        }

        if (needsBackfill) database.exec(`
            UPDATE materials
            SET extraction_status = CASE
                    WHEN lower(original_filename) LIKE '%.doc'
                      OR lower(original_filename) LIKE '%.ppt'
                        THEN 'unsupported'
                    WHEN length(replace(replace(replace(
                        trim(COALESCE(extracted_text, '')),
                        ' ', ''), char(10), ''), char(13), '')) >= 20
                        THEN 'extracted'
                    WHEN lower(original_filename) LIKE '%.txt'
                      OR lower(original_filename) LIKE '%.docx'
                      OR lower(original_filename) LIKE '%.pptx'
                        THEN 'failed'
                    ELSE 'no_text'
                END,
                extraction_error = CASE
                    WHEN lower(original_filename) LIKE '%.doc'
                      OR lower(original_filename) LIKE '%.ppt'
                        THEN 'Legacy DOC and PPT files are not supported for text extraction.'
                    WHEN length(replace(replace(replace(
                        trim(COALESCE(extracted_text, '')),
                        ' ', ''), char(10), ''), char(13), '')) >= 20
                        THEN NULL
                    WHEN lower(original_filename) LIKE '%.txt'
                      OR lower(original_filename) LIKE '%.docx'
                      OR lower(original_filename) LIKE '%.pptx'
                        THEN 'Text extraction was not available when this material was uploaded. Re-upload the file to extract it.'
                    ELSE 'This material does not contain enough extractable text.'
                END
        `);

        database.exec(`
            CREATE INDEX IF NOT EXISTS materials_course_extraction_status_idx
                ON materials(course_id, extraction_status)
        `);
    }
};
