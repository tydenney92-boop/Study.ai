const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger } = require("../utils/validation");

function normalizedTextResponse(material) {
    return {
        id: material.id,
        courseId: material.courseId,
        originalFilename: material.originalFilename,
        extractedText: material.extractedText
    };
}

function legacyListResponse(material) {
    return {
        id: material.id,
        name: material.originalFilename,
        type: material.materialType,
        unit: material.unitNumber ? `unit${material.unitNumber}` : null,
        filename: material.storedFilename,
        original_name: material.originalFilename,
        file_size: material.fileSize,
        mime_type: material.mimeType,
        created_at: material.createdAt
    };
}

function legacyDetailResponse(material) {
    return {
        ...legacyListResponse(material),
        text_content: material.extractedText
    };
}

function createCourseMaterialsRouter({ materialService, upload }) {
    const router = express.Router({ mergeParams: true });

    router.use(function parseCourse(req, res, next) {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.get("/", function(req, res) {
        res.json(materialService.list(req.courseId, req.user.id));
    });

    router.post(
        "/",
        upload.single("file"),
        asyncHandler(async function(req, res) {
            const material = await materialService.createFromUpload({
                courseId: req.courseId,
                userId: req.user.id,
                unitId: req.body.unitId,
                file: req.file
            });

            res.status(201).json(material);
        })
    );

    router.get("/:materialId", function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        res.json(materialService.get(materialId, req.courseId, req.user.id));
    });

    router.get("/:materialId/text", function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        const material = materialService.get(
            materialId,
            req.courseId,
            req.user.id
        );
        res.json(normalizedTextResponse(material));
    });

    router.delete("/:materialId", asyncHandler(async function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        await materialService.delete(materialId, req.courseId, req.user.id);
        res.status(204).end();
    }));

    return router;
}

function createLegacyMaterialsRouter({ materialService, upload }) {
    const router = express.Router();

    router.get("/", function(req, res) {
        res.json(materialService.legacyList(req.user.id).map(legacyListResponse));
    });

    router.post(
        "/",
        upload.single("file"),
        asyncHandler(async function(req, res) {
            const material = await materialService.legacyCreate({
                userId: req.user.id,
                legacyUnit: req.body.unit,
                file: req.file
            });

            res.json({
                message: "Material uploaded successfully.",
                material: {
                    id: material.id,
                    name: material.originalFilename,
                    type: material.materialType,
                    unit: material.unitNumber
                        ? `unit${material.unitNumber}`
                        : null
                }
            });
        })
    );

    router.get("/:materialId", function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        res.json(legacyDetailResponse(
            materialService.legacyGet(materialId, req.user.id)
        ));
    });

    router.get("/:materialId/text", function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        const material = materialService.legacyGet(materialId, req.user.id);
        res.json({
            id: material.id,
            name: material.originalFilename,
            text_content: material.extractedText
        });
    });

    router.use(function legacyErrorHandler(error, req, res, next) {
        if (res.headersSent) {
            return next(error);
        }

        const messages = {
            FILE_REQUIRED: "No file was uploaded.",
            MATERIAL_NOT_FOUND: "Material not found."
        };

        return res.status(error.status || 500).json({
            error: messages[error.code] ||
                (error.expose ? error.message : "Could not process material request.")
        });
    });

    return router;
}

module.exports = {
    createCourseMaterialsRouter,
    createLegacyMaterialsRouter,
    legacyDetailResponse,
    legacyListResponse
};
