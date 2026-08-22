const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const {
    positiveInteger,
    requestObject,
    requireAtLeastOne,
    stringField
} = require("../utils/validation");

function materialChanges(body) {
    requestObject(body);
    const changes = {
        displayName: stringField(body, "displayName", {
            optional: true,
            maxLength: 255
        }),
        unitId: body.unitId === undefined
            ? undefined
            : body.unitId === null || body.unitId === ""
                ? null
                : positiveInteger(body.unitId, "unitId")
    };
    return requireAtLeastOne(changes);
}

function safeContentDisposition(filename, download) {
    const fallback = filename
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/["\\\r\n]/g, "_");
    return `${download ? "attachment" : "inline"}; filename="${fallback}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function normalizedTextResponse(material) {
    return {
        id: material.id,
        courseId: material.courseId,
        originalFilename: material.originalFilename,
        extractedText: material.extractedText,
        extractionStatus: material.extractionStatus,
        extractionError: material.extractionError
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
        created_at: material.createdAt,
        extraction_status: material.extractionStatus
    };
}

function legacyDetailResponse(material) {
    return {
        ...legacyListResponse(material),
        text_content: material.extractedText,
        extraction_status: material.extractionStatus,
        extraction_error: material.extractionError
    };
}

function createCourseMaterialsRouter({ materialService, upload }) {
    const router = express.Router({ mergeParams: true });

    router.use(function parseCourse(req, res, next) {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.get("/", function(req, res) {
        const search = stringField(req.query, "search", {
            optional: true,
            allowEmpty: true,
            maxLength: 200
        }) || "";
        res.json(materialService.list(req.courseId, req.user.id, search));
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

    router.get("/:materialId/file", asyncHandler(async function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        const result = await materialService.readFile(
            materialId,
            req.courseId,
            req.user.id
        );
        res.set({
            "Cache-Control": "private, no-store",
            "Content-Disposition": safeContentDisposition(
                result.material.originalFilename,
                req.query.download === "1"
            ),
            "X-Content-Type-Options": "nosniff"
        });
        res.type(result.material.mimeType || "application/octet-stream");
        res.send(result.content);
    }));

    router.patch("/:materialId", function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        res.json(materialService.update(
            materialId,
            req.courseId,
            req.user.id,
            materialChanges(req.body)
        ));
    });

    router.delete("/:materialId", asyncHandler(async function(req, res) {
        const materialId = positiveInteger(req.params.materialId, "materialId");
        const cleanup = await materialService.delete(materialId, req.courseId, req.user.id);
        if (cleanup.pending) return res.status(202).json({ cleanup });
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
