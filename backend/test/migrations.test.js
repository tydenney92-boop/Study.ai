const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDatabase } = require("../src/database/connection");
const { runMigrations } = require("../src/database/migration-runner");
const { getColumnNames, tableExists } = require("../src/database/schema-helpers");
const extractionStatusMigration = require(
    "../src/database/migrations/004-material-extraction-status"
);
const sourceSnapshotMigration = require(
    "../src/database/migrations/005-generated-content-source-snapshots"
);
const displayNameMigration = require(
    "../src/database/migrations/006-material-display-name"
);
const materialChunksMigration = require(
    "../src/database/migrations/008-material-chunks"
);
const chunkEmbeddingsMigration = require(
    "../src/database/migrations/009-material-chunk-embeddings"
);
const askNotesConversationsMigration = require(
    "../src/database/migrations/010-ask-notes-conversations"
);
const extractionMethodMigration = require(
    "../src/database/migrations/011-material-extraction-method"
);
const examPlanningMigration = require(
    "../src/database/migrations/012-course-exam-planning"
);

const legacyMaterials = [
    {
        id: 1,
        name: "Scanned Document 5.pdf",
        unit: "unit3",
        filename: "1786937761362-Scanned Document 5.pdf",
        textLength: 32
    },
    {
        id: 2,
        name: "Exam Final Outline Review Winter 2026 (1).pdf",
        unit: "unit4",
        filename: "1786938034878-Exam Final Outline Review Winter 2026 (1).pdf",
        textLength: 13741
    },
    {
        id: 3,
        name: "midterm 2 topics.pdf",
        unit: "unit3",
        filename: "1786939177353-midterm 2 topics.pdf",
        textLength: 1079
    }
];

function createLegacyFixture(database, materials = legacyMaterials) {
    database.exec(`
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            unit TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            text_content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const insert = database.prepare(`
        INSERT INTO materials (
            id, name, type, unit, filename, original_name,
            file_size, mime_type, text_content, created_at
        ) VALUES (?, ?, 'pdf', ?, ?, ?, ?, 'application/pdf', ?, ?)
    `);

    for (const material of materials) {
        insert.run(
            material.id,
            material.name,
            material.unit,
            material.filename,
            material.name,
            1000 + material.id,
            "x".repeat(material.textLength),
            `2026-08-17 03:0${material.id}:00`
        );
    }
}

function temporaryDatabase(t) {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "study-ai-migration-")
    );
    const databasePath = path.join(directory, "fixture.db");
    const database = createDatabase(databasePath);

    t.after(() => {
        database.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    return { database, databasePath, directory };
}

test("legacy materials migrate with IDs, content, units, and ownership intact", t => {
    const context = temporaryDatabase(t);
    createLegacyFixture(context.database);

    const firstRun = runMigrations({
        database: context.database,
        databasePath: context.databasePath,
        backupDirectory: path.join(context.directory, "backups"),
        createBackup: false
    });

    assert.deepEqual(firstRun.applied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.equal(tableExists(context.database, "storage_cleanup_jobs"), true);
    assert.equal(tableExists(context.database, "material_chunks"), true);
    assert.equal(tableExists(context.database, "material_chunk_embeddings"), true);
    assert.equal(tableExists(context.database, "ask_notes_conversations"), true);
    assert.equal(tableExists(context.database, "course_exam_settings"), true);
    assert.equal(tableExists(context.database, "course_tasks"), true);
    assert.equal(tableExists(context.database, "sessions"), true);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
        1
    );
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM courses").get().count,
        1
    );
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM units").get().count,
        5
    );

    const owner = context.database.prepare(`
        SELECT users.name, users.email, courses.course_code, courses.semester
        FROM users
        JOIN courses ON courses.user_id = users.id
    `).get();

    assert.deepEqual(owner, {
        name: "Study AI Development User",
        email: "development@study.ai",
        course_code: "ECON 110",
        semester: "Legacy Prototype"
    });

    const migrated = context.database.prepare(`
        SELECT
            materials.id,
            materials.original_filename,
            materials.stored_filename,
            length(materials.extracted_text) AS text_length,
            materials.course_id,
            units.unit_number
        FROM materials
        JOIN units ON units.id = materials.unit_id
        ORDER BY materials.id
    `).all();

    assert.deepEqual(
        migrated.map(material => ({
            id: material.id,
            originalFilename: material.original_filename,
            storedFilename: material.stored_filename,
            textLength: material.text_length,
            courseId: material.course_id,
            unitNumber: material.unit_number
        })),
        [
            {
                id: 1,
                originalFilename: legacyMaterials[0].name,
                storedFilename: legacyMaterials[0].filename,
                textLength: 32,
                courseId: 1,
                unitNumber: 3
            },
            {
                id: 2,
                originalFilename: legacyMaterials[1].name,
                storedFilename: legacyMaterials[1].filename,
                textLength: 13741,
                courseId: 1,
                unitNumber: 4
            },
            {
                id: 3,
                originalFilename: legacyMaterials[2].name,
                storedFilename: legacyMaterials[2].filename,
                textLength: 1079,
                courseId: 1,
                unitNumber: 3
            }
        ]
    );

    assert.deepEqual(context.database.pragma("foreign_key_check"), []);
    assert.ok(
        context.database.prepare("PRAGMA table_info(courses)").all()
            .some(column => column.name === "last_opened_at")
    );
    assert.deepEqual(
        context.database.prepare(`
            SELECT id, extraction_status FROM materials ORDER BY id
        `).all(),
        [
            { id: 1, extraction_status: "extracted" },
            { id: 2, extraction_status: "extracted" },
            { id: 3, extraction_status: "extracted" }
        ]
    );

    const secondRun = runMigrations({
        database: context.database,
        databasePath: context.databasePath,
        backupDirectory: path.join(context.directory, "backups"),
        createBackup: false
    });

    assert.deepEqual(secondRun.applied, []);
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials").get().count,
        3
    );
});

test("exam-planning migration backfills roles and cascades course settings", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE courses (id INTEGER PRIMARY KEY);
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            course_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL
        );
        INSERT INTO courses VALUES (1);
        INSERT INTO materials VALUES (1, 1, 'Syllabus.pdf');
    `);
    examPlanningMigration.up(context.database);
    examPlanningMigration.up(context.database);
    assert.equal(context.database.prepare("SELECT material_role FROM materials").get().material_role, "general");
    context.database.prepare(`
        INSERT INTO course_exam_settings (
            course_id, exam_name, selected_unit_ids_json,
            scoped_material_ids_json, source_material_ids_json
        ) VALUES (1, 'Final', '[]', '[1]', '[1]')
    `).run();
    context.database.prepare("DELETE FROM courses WHERE id = 1").run();
    assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM course_exam_settings").get().count, 0);
});

test("an unmappable legacy unit rolls back the entire migration", t => {
    const context = temporaryDatabase(t);
    createLegacyFixture(context.database, [
        {
            id: 1,
            name: "Unknown unit.pdf",
            unit: "unit99",
            filename: "unknown-unit.pdf",
            textLength: 12
        }
    ]);

    assert.throws(
        () => runMigrations({
            database: context.database,
            databasePath: context.databasePath,
            backupDirectory: path.join(context.directory, "backups"),
            createBackup: false
        }),
        /could not be mapped to units/
    );

    assert.equal(tableExists(context.database, "users"), false);
    assert.equal(tableExists(context.database, "courses"), false);
    assert.equal(tableExists(context.database, "units"), false);
    assert.equal(tableExists(context.database, "materials"), true);
    assert.ok(getColumnNames(context.database, "materials").includes("unit"));
    assert.equal(
        context.database.prepare("SELECT COUNT(*) AS count FROM materials").get().count,
        1
    );
    assert.equal(
        context.database.prepare(
            "SELECT COUNT(*) AS count FROM schema_migrations"
        ).get().count,
        0
    );
});

test("extraction-status migration backfills legacy formats and is idempotent", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            course_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL,
            extracted_text TEXT NOT NULL DEFAULT '',
            extraction_error TEXT
        )
    `);
    const insert = context.database.prepare(`
        INSERT INTO materials (
            id, course_id, original_filename, extracted_text, extraction_error
        ) VALUES (?, 1, ?, ?, NULL)
    `);
    insert.run(1, "typed.pdf", "A sufficiently long body of extracted PDF text.");
    insert.run(2, "scan.pdf", "");
    insert.run(3, "legacy.doc", "");
    insert.run(4, "legacy.ppt", "");
    insert.run(5, "old.docx", "");
    insert.run(6, "old.txt", "Existing extracted text that remains usable.");

    extractionStatusMigration.up(context.database);
    assert.deepEqual(
        context.database.prepare(`
            SELECT id, extraction_status AS status
            FROM materials ORDER BY id
        `).all(),
        [
            { id: 1, status: "extracted" },
            { id: 2, status: "no_text" },
            { id: 3, status: "unsupported" },
            { id: 4, status: "unsupported" },
            { id: 5, status: "failed" },
            { id: 6, status: "extracted" }
        ]
    );

    context.database.prepare(`
        UPDATE materials SET extraction_status = 'no_text' WHERE id = 5
    `).run();
    extractionStatusMigration.up(context.database);
    assert.equal(
        context.database.prepare(`
            SELECT extraction_status FROM materials WHERE id = 5
        `).get().extraction_status,
        "no_text"
    );
});

test("source-snapshot migration backfills names and is idempotent", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE materials (id INTEGER PRIMARY KEY, original_filename TEXT NOT NULL);
        CREATE TABLE generated_study_guides (id INTEGER PRIMARY KEY);
        CREATE TABLE generated_quizzes (id INTEGER PRIMARY KEY);
        CREATE TABLE study_guide_materials (
            study_guide_id INTEGER NOT NULL, material_id INTEGER NOT NULL,
            PRIMARY KEY (study_guide_id, material_id)
        );
        CREATE TABLE quiz_materials (
            quiz_id INTEGER NOT NULL, material_id INTEGER NOT NULL,
            PRIMARY KEY (quiz_id, material_id)
        );
        INSERT INTO materials VALUES (7, 'Archived lecture.txt');
        INSERT INTO generated_study_guides VALUES (11);
        INSERT INTO generated_quizzes VALUES (12);
        INSERT INTO study_guide_materials VALUES (11, 7);
        INSERT INTO quiz_materials VALUES (12, 7);
    `);

    sourceSnapshotMigration.up(context.database);
    sourceSnapshotMigration.up(context.database);

    assert.deepEqual(context.database.prepare(`
        SELECT study_guide_id AS guideId, material_id AS materialId,
               material_name AS materialName FROM study_guide_sources
    `).all(), [{ guideId: 11, materialId: 7, materialName: "Archived lecture.txt" }]);
    assert.deepEqual(context.database.prepare(`
        SELECT quiz_id AS quizId, material_id AS materialId,
               material_name AS materialName FROM quiz_sources
    `).all(), [{ quizId: 12, materialId: 7, materialName: "Archived lecture.txt" }]);
});

test("material display-name migration backfills filenames and is idempotent", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            original_filename TEXT NOT NULL
        );
        INSERT INTO materials VALUES (1, 'Lecture One.pdf');
        INSERT INTO materials VALUES (2, 'Notes.txt');
    `);

    displayNameMigration.up(context.database);
    context.database.prepare(`
        UPDATE materials SET display_name = 'Custom Notes' WHERE id = 2
    `).run();
    displayNameMigration.up(context.database);

    assert.deepEqual(context.database.prepare(`
        SELECT id, display_name AS displayName FROM materials ORDER BY id
    `).all(), [
        { id: 1, displayName: "Lecture One.pdf" },
        { id: 2, displayName: "Custom Notes" }
    ]);
});

test("material-chunk migration is idempotent and enforces parent course consistency", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE courses (id INTEGER PRIMARY KEY);
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            course_id INTEGER NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );
        INSERT INTO courses VALUES (1), (2);
        INSERT INTO materials VALUES (10, 1);
    `);
    materialChunksMigration.up(context.database);
    materialChunksMigration.up(context.database);
    context.database.prepare(`
        INSERT INTO material_chunks (
            material_id, course_id, chunk_index, chunk_text,
            character_count, token_estimate, content_hash, chunking_version
        ) VALUES (10, 1, 0, 'Chunk text', 10, 3, 'hash', 1)
    `).run();

    assert.throws(() => context.database.prepare(`
        INSERT INTO material_chunks (
            material_id, course_id, chunk_index, chunk_text,
            character_count, token_estimate, content_hash, chunking_version
        ) VALUES (10, 2, 1, 'Wrong course', 12, 3, 'hash', 1)
    `).run(), /must belong to its course/);
    assert.deepEqual(context.database.pragma("foreign_key_check"), []);
});

test("chunk-embedding migration is idempotent, versioned, and cascades with chunks", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE courses (id INTEGER PRIMARY KEY);
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            course_id INTEGER NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );
        INSERT INTO courses VALUES (1);
        INSERT INTO materials VALUES (10, 1);
    `);
    materialChunksMigration.up(context.database);
    chunkEmbeddingsMigration.up(context.database);
    chunkEmbeddingsMigration.up(context.database);
    const chunkId = context.database.prepare(`
        INSERT INTO material_chunks (
            material_id, course_id, chunk_index, chunk_text,
            character_count, token_estimate, content_hash, chunking_version
        ) VALUES (10, 1, 0, 'Chunk text', 10, 3, 'hash', 1)
    `).run().lastInsertRowid;
    context.database.prepare(`
        INSERT INTO material_chunk_embeddings (
            chunk_id, provider, model, embedding_version, dimensions,
            vector_json, source_content_hash
        ) VALUES (?, 'openai', 'embedding-model', 1, 2, '[0.1,0.2]', 'hash')
    `).run(chunkId);

    assert.throws(() => context.database.prepare(`
        INSERT INTO material_chunk_embeddings (
            chunk_id, provider, model, embedding_version, dimensions,
            vector_json, source_content_hash
        ) VALUES (?, 'openai', 'other-model', 1, 2, '[0.1,0.2]', 'hash')
    `).run(chunkId), /UNIQUE/);
    context.database.prepare("DELETE FROM materials WHERE id = 10").run();
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) AS count FROM material_chunk_embeddings"
    ).get().count, 0);
});

test("Ask My Notes conversation migration is idempotent and cascades owned history", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY);
        CREATE TABLE courses (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            UNIQUE (id, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            course_id INTEGER NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );
        INSERT INTO users VALUES (1);
        INSERT INTO courses VALUES (3, 1);
        INSERT INTO materials VALUES (7, 3);
    `);
    askNotesConversationsMigration.up(context.database);
    askNotesConversationsMigration.up(context.database);
    const conversationId = context.database.prepare(`
        INSERT INTO ask_notes_conversations (user_id, course_id) VALUES (1, 3)
    `).run().lastInsertRowid;
    const messageId = context.database.prepare(`
        INSERT INTO ask_notes_messages (conversation_id, role, content)
        VALUES (?, 'user', 'Explain elasticity')
    `).run(conversationId).lastInsertRowid;
    context.database.prepare(`
        INSERT INTO ask_notes_message_materials (
            message_id, relationship, source_order, material_id, material_name
        ) VALUES (?, 'selection', 0, 7, 'Lecture.txt')
    `).run(messageId);

    context.database.prepare("DELETE FROM materials WHERE id = 7").run();
    assert.deepEqual(context.database.prepare(`
        SELECT material_id AS materialId, material_name AS name
        FROM ask_notes_message_materials
    `).get(), { materialId: null, name: "Lecture.txt" });
    context.database.prepare("DELETE FROM courses WHERE id = 3").run();
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) AS count FROM ask_notes_conversations"
    ).get().count, 0);
    assert.deepEqual(context.database.pragma("foreign_key_check"), []);
});

test("material extraction-method migration backfills native text and is idempotent", t => {
    const context = temporaryDatabase(t);
    context.database.exec(`
        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            extraction_status TEXT NOT NULL
        );
        INSERT INTO materials VALUES (1, 'extracted'), (2, 'no_text'), (3, 'failed');
    `);
    extractionMethodMigration.up(context.database);
    extractionMethodMigration.up(context.database);
    assert.equal(getColumnNames(context.database, "materials").includes("extraction_method"), true);
    assert.deepEqual(context.database.prepare(`
        SELECT id, extraction_method AS method FROM materials ORDER BY id
    `).all(), [
        { id: 1, method: "native" },
        { id: 2, method: null },
        { id: 3, method: null }
    ]);
    assert.throws(() => context.database.prepare(`
        UPDATE materials SET extraction_method = 'invented' WHERE id = 1
    `).run(), /CHECK/);
});
