const path = require("path");
const { AppError } = require("../utils/app-error");

const MATERIAL_TYPES = new Map([
    [".pdf", "pdf"],
    [".txt", "notes"],
    [".docx", "notes"],
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
            message: "Supported file types are PDF, TXT, DOCX, and PPTX. Legacy DOC and PPT files cannot be extracted.",
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
