const { getColumnNames, tableExists } = require("../schema-helpers");

module.exports = {
    id: 12,
    name: "course-exam-planning",
    up(database) {
        if (tableExists(database, "materials")) {
            const columns = getColumnNames(database, "materials");
            if (!columns.includes("material_role")) {
                database.exec(`
                    ALTER TABLE materials ADD COLUMN material_role TEXT NOT NULL
                        DEFAULT 'general'
                        CHECK (material_role IN (
                            'general', 'syllabus', 'exam_review', 'study_guide'
                        ))
                `);
            }
            database.exec(`
                UPDATE materials SET material_role = 'general'
                WHERE material_role IS NULL OR trim(material_role) = ''
            `);
        }

        database.exec(`
            CREATE TABLE IF NOT EXISTS course_exam_settings (
                course_id INTEGER PRIMARY KEY,
                exam_name TEXT,
                exam_date TEXT,
                selected_unit_ids_json TEXT NOT NULL DEFAULT '[]'
                    CHECK (json_valid(selected_unit_ids_json)),
                scoped_material_ids_json TEXT NOT NULL DEFAULT '[]'
                    CHECK (json_valid(scoped_material_ids_json)),
                source_material_ids_json TEXT NOT NULL DEFAULT '[]'
                    CHECK (json_valid(source_material_ids_json)),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            )
        `);
    }
};
