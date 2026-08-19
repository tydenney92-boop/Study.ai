const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { AppError } = require("../utils/app-error");

function createLocalFileStorage({ uploadDirectory }) {
    if (!uploadDirectory) {
        throw new Error("An upload directory is required.");
    }

    function resolveStoredFilename(storedFilename) {
        if (
            typeof storedFilename !== "string" ||
            path.basename(storedFilename) !== storedFilename
        ) {
            throw new AppError({
                code: "INVALID_STORED_FILENAME",
                message: "Invalid stored filename.",
                status: 500,
                expose: false
            });
        }

        return path.join(uploadDirectory, storedFilename);
    }

    return {
        ensureReady() {
            fs.mkdirSync(uploadDirectory, { recursive: true });
        },

        createUploadMiddleware({ maxFileSize, allowedExtensions }) {
            const allowed = new Set(allowedExtensions);
            return multer({
                storage: multer.memoryStorage(),
                limits: {
                    fileSize: maxFileSize,
                    files: 1
                },
                fileFilter(req, file, callback) {
                    const extension = path.extname(file.originalname).toLowerCase();

                    if (!allowed.has(extension)) {
                        return callback(new AppError({
                            code: "FILE_TYPE_NOT_ALLOWED",
                            message: "Supported file types are PDF, TXT, DOCX, and PPTX. Legacy DOC and PPT files cannot be extracted.",
                            status: 415
                        }));
                    }

                    return callback(null, true);
                }
            });
        },

        async persist(file) {
            const extension = path.extname(file.originalname).toLowerCase();
            const storedFilename = `${crypto.randomUUID()}${extension}`;
            await fs.promises.writeFile(
                resolveStoredFilename(storedFilename),
                file.buffer,
                { flag: "wx" }
            );
            return storedFilename;
        },

        async read(storedFilename) {
            return fs.promises.readFile(
                resolveStoredFilename(storedFilename)
            );
        },

        async remove(storedFilename) {
            try {
                await fs.promises.unlink(resolveStoredFilename(storedFilename));
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }
        },

        async healthCheck() {
            await fs.promises.access(uploadDirectory, fs.constants.W_OK);
            return true;
        },

        driver: "local"
    };
}

module.exports = {
    createLocalFileStorage
};
