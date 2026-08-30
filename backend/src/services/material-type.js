const path = require("path");
const { AppError } = require("../utils/app-error");

const MATERIAL_TYPES = new Map([
    [".pdf", "pdf"],
    [".txt", "notes"],
    [".docx", "notes"],
    [".pptx", "slides"],
    [".png", "image"],
    [".jpg", "image"],
    [".jpeg", "image"]
]);

const ALLOWED_EXTENSIONS = [...MATERIAL_TYPES.keys()];

function extensionFor(filename) {
    return path.extname(filename || "").toLowerCase();
}

function materialTypeFor(filename) {
    const materialType = MATERIAL_TYPES.get(extensionFor(filename));

    if (!materialType) {
        throw new AppError({
            code: "FILE_TYPE_NOT_ALLOWED",
            message: "Supported file types are PDF, TXT, DOCX, PPTX, PNG, and JPEG. Legacy DOC and PPT files cannot be extracted.",
            status: 415
        });
    }

    return materialType;
}

function startsWith(buffer, signature) {
    return buffer.length >= signature.length && signature.every(
        (byte, index) => buffer[index] === byte
    );
}

function endsWith(buffer, signature) {
    if (buffer.length < signature.length) return false;
    const offset = buffer.length - signature.length;
    return signature.every((byte, index) => buffer[offset + index] === byte);
}

function validateMaterialUpload({ originalname, mimetype, buffer }) {
    const extension = extensionFor(originalname);
    materialTypeFor(originalname);
    const mimeType = String(mimetype || "").toLowerCase();
    const genericMime = mimeType === "" || mimeType === "application/octet-stream";
    const signatures = {
        ".png": startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
            endsWith(buffer, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
        ".jpg": startsWith(buffer, [0xff, 0xd8, 0xff]) && endsWith(buffer, [0xff, 0xd9]),
        ".jpeg": startsWith(buffer, [0xff, 0xd8, 0xff]) && endsWith(buffer, [0xff, 0xd9]),
        ".pdf": buffer.subarray(0, 5).toString("ascii") === "%PDF-",
        ".docx": startsWith(buffer, [0x50, 0x4b]),
        ".pptx": startsWith(buffer, [0x50, 0x4b])
    };
    const expectedMimes = {
        ".png": ["image/png"],
        ".jpg": ["image/jpeg"],
        ".jpeg": ["image/jpeg"],
        ".pdf": ["application/pdf"],
        ".txt": ["text/plain"],
        ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
    };

    if (signatures[extension] === false ||
        (!genericMime && !expectedMimes[extension].includes(mimeType))) {
        throw new AppError({
            code: "FILE_CONTENT_TYPE_INVALID",
            message: "The file content does not match its extension or media type.",
            status: 415
        });
    }
}

module.exports = {
    ALLOWED_EXTENSIONS,
    extensionFor,
    materialTypeFor,
    validateMaterialUpload
};
