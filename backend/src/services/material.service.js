const { AppError } = require("../utils/app-error");
const { positiveInteger } = require("../utils/validation");
const { materialTypeFor } = require("./material-type");

function createMaterialService({
    coursesRepository,
    coursesService,
    unitsRepository,
    materialsRepository,
    textExtractionService,
    fileStorage
}) {
    function requireLegacyCourse(userId) {
        const course = coursesRepository.findLegacyOwned(userId);

        if (!course) {
            throw new AppError({
                code: "LEGACY_COURSE_NOT_FOUND",
                message: "The legacy ECON 110 course was not found.",
                status: 500,
                expose: false
            });
        }

        return course;
    }

    async function removeFailedUpload(storedFilename) {
        if (!storedFilename) {
            return;
        }

        try {
            await fileStorage.remove(storedFilename);
        } catch (cleanupError) {
            console.error("Failed to clean up uploaded file:", cleanupError);
        }
    }

    async function createFromUpload({ courseId, userId, unitId, file }) {
        if (!file) {
            throw new AppError({
                code: "FILE_REQUIRED",
                message: "A file is required.",
                status: 400
            });
        }

        let storedFilename = null;
        try {
            coursesService.requireOwned(courseId, userId);

            if (
                typeof file.originalname !== "string" ||
                file.originalname.length === 0 ||
                file.originalname.length > 255
            ) {
                throw new AppError({
                    code: "INVALID_ORIGINAL_FILENAME",
                    message: "The original filename must be between 1 and 255 characters.",
                    status: 400
                });
            }

            const parsedUnitId = unitId === undefined || unitId === null || unitId === ""
                ? null
                : positiveInteger(unitId, "unitId");

            if (
                parsedUnitId !== null &&
                !unitsRepository.findOwned(parsedUnitId, courseId, userId)
            ) {
                throw new AppError({
                    code: "UNIT_NOT_FOUND",
                    message: "Unit not found in this course.",
                    status: 404
                });
            }

            const materialType = materialTypeFor(file.originalname);
            storedFilename = await fileStorage.persist(file);
            const extraction = await textExtractionService.extract({
                storedFilename,
                originalFilename: file.originalname,
                materialType
            });
            const extractionResult = typeof extraction === "string"
                ? {
                    text: extraction,
                    status: extraction.trim() ? "extracted" : "no_text",
                    error: extraction.trim()
                        ? null
                        : "This material does not contain enough extractable text."
                }
                : extraction;

            const materialId = materialsRepository.create({
                courseId,
                unitId: parsedUnitId,
                originalFilename: file.originalname,
                storedFilename,
                materialType,
                extractedText: extractionResult.text,
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadStatus: "ready",
                extractionError: extractionResult.error,
                extractionStatus: extractionResult.status
            });

            return materialsRepository.findOwned(materialId, courseId, userId);
        } catch (error) {
            await removeFailedUpload(storedFilename);
            throw error;
        }
    }

    return {
        list(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return materialsRepository.listOwned(courseId, userId);
        },

        get(materialId, courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            const material = materialsRepository.findOwned(
                materialId,
                courseId,
                userId
            );

            if (!material) {
                throw new AppError({
                    code: "MATERIAL_NOT_FOUND",
                    message: "Material not found in this course.",
                    status: 404
                });
            }

            return material;
        },

        createFromUpload,

        async delete(materialId, courseId, userId) {
            const material = this.get(materialId, courseId, userId);

            try {
                await fileStorage.remove(material.storedFilename);
            } catch (error) {
                throw new AppError({
                    code: "MATERIAL_STORAGE_CLEANUP_FAILED",
                    message: "The uploaded file could not be removed. The material was not deleted.",
                    status: 503,
                    expose: true
                });
            }

            materialsRepository.deleteOwned(materialId, courseId, userId);
        },

        legacyCourse(userId) {
            return requireLegacyCourse(userId);
        },

        legacyList(userId) {
            const course = requireLegacyCourse(userId);
            return materialsRepository.listOwned(course.id, userId);
        },

        legacyGet(materialId, userId) {
            const course = requireLegacyCourse(userId);
            return this.get(materialId, course.id, userId);
        },

        async legacyCreate({ userId, legacyUnit, file }) {
            const course = requireLegacyCourse(userId);
            const match = /^unit(\d+)$/i.exec(legacyUnit || "unit1");
            const unitNumber = match ? Number(match[1]) : 1;
            const unit = unitsRepository.findByNumberOwned(
                course.id,
                userId,
                unitNumber
            );

            return createFromUpload({
                courseId: course.id,
                userId,
                unitId: unit ? unit.id : null,
                file
            });
        }
    };
}

module.exports = {
    createMaterialService
};
