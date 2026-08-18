const fs = require("fs");
const path = require("path");
const multer = require("multer");

function createLocalFileStorage({ uploadDirectory }) {
    if (!uploadDirectory) {
        throw new Error("An upload directory is required.");
    }

    return {
        ensureReady() {
            fs.mkdirSync(uploadDirectory, { recursive: true });
        },

        createUploadMiddleware() {
            const storage = multer.diskStorage({
                destination(req, file, callback) {
                    callback(null, uploadDirectory);
                },

                filename(req, file, callback) {
                    callback(null, `${Date.now()}-${file.originalname}`);
                }
            });

            return multer({ storage });
        },

        async read(storedFilename) {
            return fs.promises.readFile(
                path.join(uploadDirectory, storedFilename)
            );
        }
    };
}

module.exports = {
    createLocalFileStorage
};
