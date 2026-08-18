const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../../src/app");

function createTestApp(options = {}) {
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "study-ai-test-")
    );

    const app = createApp({
        config: {
            databasePath: path.join(temporaryDirectory, "test.db"),
            uploadDirectory: path.join(temporaryDirectory, "uploads"),
            backupDirectory: path.join(temporaryDirectory, "backups"),
            migrationBackup: false,
            ...(options.config || {})
        },
        extendRepositories: options.extendRepositories,
        textExtractionService: options.textExtractionService,
        aiClient: options.aiClient || {
            async generate() {
                throw new Error("Unexpected AI request in test.");
            }
        }
    });

    function cleanup() {
        app.locals.database.close();
        fs.rmSync(temporaryDirectory, {
            recursive: true,
            force: true
        });
    }

    return {
        app,
        database: app.locals.database,
        temporaryDirectory,
        cleanup
    };
}

function insertMaterial(database, overrides = {}) {
    const material = {
        courseId: 1,
        unitId: 1,
        materialType: "notes",
        storedFilename: "stored-test-notes.txt",
        originalFilename: "Test notes.txt",
        fileSize: 42,
        mimeType: "text/plain",
        extractedText: "Supply and demand test content.",
        ...overrides
    };

    const result = database.prepare(`
        INSERT INTO materials (
            course_id,
            unit_id,
            original_filename,
            stored_filename,
            material_type,
            file_size,
            mime_type,
            extracted_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        material.courseId,
        material.unitId,
        material.originalFilename,
        material.storedFilename,
        material.materialType,
        material.fileSize,
        material.mimeType,
        material.extractedText
    );

    return Number(result.lastInsertRowid);
}

module.exports = {
    createTestApp,
    insertMaterial
};
