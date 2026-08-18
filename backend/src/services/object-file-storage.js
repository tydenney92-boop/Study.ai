const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand
} = require("@aws-sdk/client-s3");
const { AppError } = require("../utils/app-error");

function createObjectFileStorage({
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle = false,
    client
}) {
    const credentials = accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;
    const s3 = client || new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials,
        forcePathStyle
    });

    function validateKey(key) {
        if (typeof key !== "string" || path.basename(key) !== key) {
            throw new AppError({
                code: "INVALID_STORED_FILENAME",
                message: "Invalid stored filename.",
                status: 500,
                expose: false
            });
        }
        return key;
    }

    return {
        driver: "s3",
        ensureReady() {},
        createUploadMiddleware({ maxFileSize, allowedExtensions }) {
            const allowed = new Set(allowedExtensions);
            return multer({
                storage: multer.memoryStorage(),
                limits: { fileSize: maxFileSize, files: 1 },
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
        async persist(file) {
            const extension = path.extname(file.originalname).toLowerCase();
            const key = `${crypto.randomUUID()}${extension}`;
            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype
            }));
            return key;
        },
        async read(storedFilename) {
            const response = await s3.send(new GetObjectCommand({
                Bucket: bucket,
                Key: validateKey(storedFilename)
            }));
            if (!response.Body) throw new Error("Object storage returned an empty body.");
            return Buffer.from(await response.Body.transformToByteArray());
        },
        async remove(storedFilename) {
            await s3.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: validateKey(storedFilename)
            }));
        },
        async healthCheck() {
            await s3.send(new HeadBucketCommand({ Bucket: bucket }));
            return true;
        }
    };
}

module.exports = { createObjectFileStorage };
