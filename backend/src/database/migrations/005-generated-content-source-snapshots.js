const { tableExists } = require("../schema-helpers");

module.exports = {
    id: 5,
    name: "generated-content-source-snapshots",
    up(database) {
        if (!tableExists(database, "study_guide_sources")) {
            database.exec(`
                CREATE TABLE study_guide_sources (
                    study_guide_id INTEGER NOT NULL,
                    source_order INTEGER NOT NULL CHECK (source_order >= 0),
                    material_id INTEGER,
                    material_name TEXT NOT NULL,
                    PRIMARY KEY (study_guide_id, source_order),
                    FOREIGN KEY (study_guide_id)
                        REFERENCES generated_study_guides(id) ON DELETE CASCADE,
                    FOREIGN KEY (material_id)
                        REFERENCES materials(id) ON DELETE SET NULL
                );

                CREATE INDEX study_guide_sources_material_idx
                    ON study_guide_sources(material_id);
            `);

            database.exec(`
                INSERT INTO study_guide_sources (
                    study_guide_id, source_order, material_id, material_name
                )
                SELECT
                    context.study_guide_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY context.study_guide_id
                        ORDER BY context.material_id
                    ) - 1,
                    context.material_id,
                    materials.original_filename
                FROM study_guide_materials AS context
                JOIN materials ON materials.id = context.material_id
            `);
        }

        if (!tableExists(database, "quiz_sources")) {
            database.exec(`
                CREATE TABLE quiz_sources (
                    quiz_id INTEGER NOT NULL,
                    source_order INTEGER NOT NULL CHECK (source_order >= 0),
                    material_id INTEGER,
                    material_name TEXT NOT NULL,
                    PRIMARY KEY (quiz_id, source_order),
                    FOREIGN KEY (quiz_id)
                        REFERENCES generated_quizzes(id) ON DELETE CASCADE,
                    FOREIGN KEY (material_id)
                        REFERENCES materials(id) ON DELETE SET NULL
                );

                CREATE INDEX quiz_sources_material_idx
                    ON quiz_sources(material_id);
            `);

            database.exec(`
                INSERT INTO quiz_sources (
                    quiz_id, source_order, material_id, material_name
                )
                SELECT
                    context.quiz_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY context.quiz_id
                        ORDER BY context.material_id
                    ) - 1,
                    context.material_id,
                    materials.original_filename
                FROM quiz_materials AS context
                JOIN materials ON materials.id = context.material_id
            `);
        }
    }
};
