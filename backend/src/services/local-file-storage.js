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
            const storage = multer.diskStorage({
                destination(req, file, callback) {
                    callback(null, uploadDirectory);
                },

                filename(req, file, callback) {
                    const extension = path.extname(file.originalname).toLowerCase();
                    callback(null, `${crypto.randomUUID()}${extension}`);
                }
            });

            return multer({
                storage,
                limits: {
                    fileSize: maxFileSize,
                    files: 1
                },
                fileFilter(req, file, callback) {
                    const extension = path.extname(file.originalname).toLowerCase();

                    if (!allowed.has(extension)) {
                        return callback(new AppError({
                            code: "FILE_TYPE_NOT_ALLOWED",
                            message: "Allowed file types are PDF, TXT, DOC, DOCX, PPT, and PPTX.",
                            status: 415
                        }));
                    }

                    return callback(null, true);
                }
            });
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
        }
    };
}

module.exports = {
    createLocalFileStorage
};
