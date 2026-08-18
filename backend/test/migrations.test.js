const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDatabase } = require("../src/database/connection");
const { runMigrations } = require("../src/database/migration-runner");
const { getColumnNames, tableExists } = require("../src/database/schema-helpers");

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

    assert.deepEqual(firstRun.applied, [1, 2, 3]);
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
