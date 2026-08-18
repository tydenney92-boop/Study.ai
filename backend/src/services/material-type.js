const path = require("path");
const { AppError } = require("../utils/app-error");

const MATERIAL_TYPES = new Map([
    [".pdf", "pdf"],
    [".txt", "notes"],
    [".doc", "notes"],
    [".docx", "notes"],
    [".ppt", "slides"],
    [".pptx", "slides"]
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
            message: "Allowed file types are PDF, TXT, DOC, DOCX, PPT, and PPTX.",
            status: 415
        });
    }

    return materialType;
}

module.exports = {
    ALLOWED_EXTENSIONS,
    extensionFor,
    materialTypeFor
};
