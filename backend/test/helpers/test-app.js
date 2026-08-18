const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const supertest = require("supertest");
const { createApp } = require("../../src/app");

function createTestApp(options = {}) {
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "study-ai-test-")
    );

    const sessionSecret = "study-ai-automated-test-session-secret";
    const app = createApp({
        config: {
            databasePath: path.join(temporaryDirectory, "test.db"),
            uploadDirectory: path.join(temporaryDirectory, "uploads"),
            backupDirectory: path.join(temporaryDirectory, "backups"),
            migrationBackup: false,
            sessionSecret,
            passwordRounds: 4,
            ...(options.config || {})
        },
        extendRepositories: options.extendRepositories,
        fileStorage: options.fileStorage,
        textExtractionService: options.textExtractionService,
        aiUsageGuard: options.aiUsageGuard,
        aiClient: options.aiClient || {
            async generate() {
                throw new Error("Unexpected AI request in test.");
            }
        }
    });

    const sid = crypto.randomBytes(24).toString("hex");
    const signature = crypto
        .createHmac("sha256", sessionSecret)
        .update(sid)
        .digest("base64")
        .replace(/=+$/, "");
    const cookieValue = encodeURIComponent(`s:${sid}.${signature}`);
    const expiresAt = Date.now() + 60 * 60 * 1000;
    app.locals.sessionStore.sessionsRepository.upsert(sid, {
        cookie: {
            originalMaxAge: 60 * 60 * 1000,
            expires: new Date(expiresAt).toISOString(),
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: false
        },
        userId: 1
    }, expiresAt);
    app.locals.testAuthenticationCookie = `study_ai_session=${cookieValue}`;

    function cleanup() {
        app.locals.sessionStore?.close();
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

function authenticatedRequest(app) {
    const request = supertest(app);
    return new Proxy(request, {
        get(target, property) {
            if (["get", "post", "put", "patch", "delete"].includes(property)) {
                return path => target[property](path)
                    .set("Cookie", app.locals.testAuthenticationCookie);
            }
            return target[property];
        }
    });
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
    authenticatedRequest,
    insertMaterial
};
