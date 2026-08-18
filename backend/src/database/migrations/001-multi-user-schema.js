const { getColumnNames, tableExists } = require("../schema-helpers");

const DEVELOPMENT_USER = {
    id: 1,
    name: "Study AI Development User",
    email: "development@study.ai"
};

const LEGACY_COURSE = {
    id: 1,
    courseName: "Introduction to Economics",
    courseCode: "ECON 110",
    semester: "Legacy Prototype"
};

const LEGACY_UNITS = [
    { unitNumber: 1, name: "Introduction to Economics" },
    { unitNumber: 2, name: "Supply & Demand" },
    { unitNumber: 3, name: "Macroeconomics" },
    { unitNumber: 4, name: "GDP & Economic Growth" },
    { unitNumber: 5, name: "Fiscal & Monetary Policy" }
];

function createEntityTables(database) {
    database.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT,
            auth_provider TEXT,
            auth_provider_id TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (
                (auth_provider IS NULL AND auth_provider_id IS NULL) OR
                (auth_provider IS NOT NULL AND auth_provider_id IS NOT NULL)
            )
        );

        CREATE UNIQUE INDEX users_auth_provider_identity_idx
            ON users(auth_provider, auth_provider_id)
            WHERE auth_provider IS NOT NULL;

        CREATE TABLE courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_name TEXT NOT NULL,
            course_code TEXT NOT NULL,
            semester TEXT NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, course_code, semester),
            UNIQUE (id, user_id)
        );

        CREATE INDEX courses_user_id_idx ON courses(user_id);

        CREATE TABLE units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            unit_number INTEGER NOT NULL CHECK (unit_number > 0),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE (course_id, unit_number),
            UNIQUE (course_id, id)
        );

        CREATE INDEX units_course_id_idx ON units(course_id);
    `);
}

function createMaterialsTable(database) {
    database.exec(`
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            unit_id INTEGER,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            material_type TEXT NOT NULL,
            extracted_text TEXT NOT NULL DEFAULT '',
            file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
            mime_type TEXT,
            upload_status TEXT NOT NULL DEFAULT 'ready'
                CHECK (upload_status IN ('processing', 'ready', 'failed')),
            extraction_error TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
            UNIQUE (course_id, stored_filename)
        );

        CREATE INDEX materials_course_id_idx ON materials(course_id);
        CREATE INDEX materials_unit_id_idx ON materials(unit_id);
        CREATE INDEX materials_created_at_idx ON materials(created_at);

        CREATE TRIGGER materials_unit_course_insert
        BEFORE INSERT ON materials
        WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM units
            WHERE id = NEW.unit_id AND course_id = NEW.course_id
        )
        BEGIN
            SELECT RAISE(ABORT, 'Material unit must belong to its course');
        END;

        CREATE TRIGGER materials_unit_course_update
        BEFORE UPDATE OF course_id, unit_id ON materials
        WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM units
            WHERE id = NEW.unit_id AND course_id = NEW.course_id
        )
        BEGIN
            SELECT RAISE(ABORT, 'Material unit must belong to its course');
        END;
    `);
}

function createGeneratedContentTables(database) {
    database.exec(`
        CREATE TABLE generated_study_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            generated_content TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id, user_id)
                REFERENCES courses(id, user_id) ON DELETE CASCADE,
            UNIQUE (id, user_id)
        );

        CREATE INDEX generated_study_guides_user_course_idx
            ON generated_study_guides(user_id, course_id);

        CREATE TABLE study_guide_materials (
            study_guide_id INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            PRIMARY KEY (study_guide_id, material_id),
            FOREIGN KEY (study_guide_id)
                REFERENCES generated_study_guides(id) ON DELETE CASCADE,
            FOREIGN KEY (material_id)
                REFERENCES materials(id) ON DELETE CASCADE
        );

        CREATE INDEX study_guide_materials_material_id_idx
            ON study_guide_materials(material_id);

        CREATE TABLE generated_quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            generated_quiz_json TEXT NOT NULL
                CHECK (json_valid(generated_quiz_json)),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id, user_id)
                REFERENCES courses(id, user_id) ON DELETE CASCADE,
            UNIQUE (id, user_id)
        );

        CREATE INDEX generated_quizzes_user_course_idx
            ON generated_quizzes(user_id, course_id);

        CREATE TABLE quiz_materials (
            quiz_id INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            PRIMARY KEY (quiz_id, material_id),
            FOREIGN KEY (quiz_id)
                REFERENCES generated_quizzes(id) ON DELETE CASCADE,
            FOREIGN KEY (material_id)
                REFERENCES materials(id) ON DELETE CASCADE
        );

        CREATE INDEX quiz_materials_material_id_idx
            ON quiz_materials(material_id);

        CREATE TABLE quiz_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quiz_id INTEGER NOT NULL,
            score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
            answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
            results_json TEXT CHECK (
                results_json IS NULL OR json_valid(results_json)
            ),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quiz_id, user_id)
                REFERENCES generated_quizzes(id, user_id) ON DELETE CASCADE
        );

        CREATE INDEX quiz_attempts_user_id_idx ON quiz_attempts(user_id);
        CREATE INDEX quiz_attempts_quiz_id_idx ON quiz_attempts(quiz_id);
    `);
}

function createFlashcardTables(database) {
    database.exec(`
        CREATE TABLE flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            mastery_level INTEGER NOT NULL DEFAULT 0
                CHECK (mastery_level BETWEEN 0 AND 5),
            correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
            incorrect_count INTEGER NOT NULL DEFAULT 0
                CHECK (incorrect_count >= 0),
            last_reviewed_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id, user_id)
                REFERENCES courses(id, user_id) ON DELETE CASCADE
        );

        CREATE INDEX flashcards_user_course_idx
            ON flashcards(user_id, course_id);

        CREATE TABLE flashcard_materials (
            flashcard_id INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            PRIMARY KEY (flashcard_id, material_id),
            FOREIGN KEY (flashcard_id)
                REFERENCES flashcards(id) ON DELETE CASCADE,
            FOREIGN KEY (material_id)
                REFERENCES materials(id) ON DELETE CASCADE
        );

        CREATE INDEX flashcard_materials_material_id_idx
            ON flashcard_materials(material_id);
    `);
}

function seedLegacyOwnerAndCourse(database) {
    database.prepare(`
        INSERT INTO users (id, name, email)
        VALUES (?, ?, ?)
    `).run(
        DEVELOPMENT_USER.id,
        DEVELOPMENT_USER.name,
        DEVELOPMENT_USER.email
    );

    database.prepare(`
        INSERT INTO courses (
            id,
            user_id,
            course_name,
            course_code,
            semester
        ) VALUES (?, ?, ?, ?, ?)
    `).run(
        LEGACY_COURSE.id,
        DEVELOPMENT_USER.id,
        LEGACY_COURSE.courseName,
        LEGACY_COURSE.courseCode,
        LEGACY_COURSE.semester
    );

    const insertUnit = database.prepare(`
        INSERT INTO units (course_id, name, unit_number)
        VALUES (?, ?, ?)
    `);

    for (const unit of LEGACY_UNITS) {
        insertUnit.run(LEGACY_COURSE.id, unit.name, unit.unitNumber);
    }
}

function migrateLegacyMaterials(database) {
    const columns = getColumnNames(database, "materials");
    const isLegacySchema = columns.includes("unit") && columns.includes("filename");
    const isCurrentSchema = columns.includes("course_id") &&
        columns.includes("stored_filename");

    if (isCurrentSchema) {
        return;
    }

    if (tableExists(database, "materials") && !isLegacySchema) {
        throw new Error("The existing materials schema is not recognized.");
    }

    if (!isLegacySchema) {
        createMaterialsTable(database);
        return;
    }

    database.exec("ALTER TABLE materials RENAME TO materials_legacy");
    createMaterialsTable(database);

    database.exec(`
        INSERT INTO materials (
            id,
            course_id,
            unit_id,
            original_filename,
            stored_filename,
            material_type,
            extracted_text,
            file_size,
            mime_type,
            upload_status,
            created_at
        )
        SELECT
            legacy.id,
            ${LEGACY_COURSE.id},
            unit.id,
            legacy.original_name,
            legacy.filename,
            legacy.type,
            COALESCE(legacy.text_content, ''),
            legacy.file_size,
            legacy.mime_type,
            'ready',
            legacy.created_at
        FROM materials_legacy AS legacy
        LEFT JOIN units AS unit
            ON unit.course_id = ${LEGACY_COURSE.id}
            AND unit.unit_number = CAST(
                REPLACE(LOWER(legacy.unit), 'unit', '') AS INTEGER
            )
    `);

    const unmappedCount = database.prepare(`
        SELECT COUNT(*) AS count
        FROM materials
        WHERE unit_id IS NULL
    `).get().count;

    if (unmappedCount > 0) {
        throw new Error(
            `${unmappedCount} legacy materials could not be mapped to units.`
        );
    }

    database.exec("DROP TABLE materials_legacy");
}

function up(database) {
    createEntityTables(database);
    seedLegacyOwnerAndCourse(database);
    migrateLegacyMaterials(database);
    createGeneratedContentTables(database);
    createFlashcardTables(database);
}

module.exports = {
    id: 1,
    name: "multi-user-schema",
    up,
    DEVELOPMENT_USER,
    LEGACY_COURSE,
    LEGACY_UNITS
};
