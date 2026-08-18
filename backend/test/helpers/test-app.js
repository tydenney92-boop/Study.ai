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
            uploadDirectory: path.join(temporaryDirectory, "uploads")
        },
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
        name: "Test notes.txt",
        type: "notes",
        unit: "unit1",
        filename: "stored-test-notes.txt",
        originalName: "Test notes.txt",
        fileSize: 42,
        mimeType: "text/plain",
        textContent: "Supply and demand test content.",
        ...overrides
    };

    const result = database.prepare(`
        INSERT INTO materials (
            name,
            type,
            unit,
            filename,
            original_name,
            file_size,
            mime_type,
            text_content
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        material.name,
        material.type,
        material.unit,
        material.filename,
        material.originalName,
        material.fileSize,
        material.mimeType,
        material.textContent
    );

    return Number(result.lastInsertRowid);
}

module.exports = {
    createTestApp,
    insertMaterial
};
