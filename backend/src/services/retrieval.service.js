const { AppError } = require("../utils/app-error");
const { positiveInteger, stringField, validationError } = require("../utils/validation");

const DEFAULT_RETRIEVAL_LIMIT = 5;
const MAX_RETRIEVAL_LIMIT = 20;

function createRetrievalService({ coursesService, materialsRepository, retrievalBackend }) {
    return {
        retrieveRelevantChunks({ courseId, userId, materialIds, query, limit }) {
            coursesService.requireOwned(courseId, userId);
            if (!Array.isArray(materialIds) || materialIds.length === 0) {
                throw validationError("materialIds must be a non-empty array.", {
                    field: "materialIds"
                });
            }
            const normalizedIds = materialIds.map(id => positiveInteger(id, "materialIds"));
            const uniqueIds = [...new Set(normalizedIds)];
            if (uniqueIds.length !== normalizedIds.length) {
                throw validationError("materialIds cannot contain duplicates.", {
                    field: "materialIds"
                });
            }
            const ownedMaterials = materialsRepository.findContextByIds(
                courseId,
                userId,
                uniqueIds
            );
            if (ownedMaterials.length !== uniqueIds.length) {
                throw new AppError({
                    code: "MATERIAL_CONTEXT_INVALID",
                    message: "Every selected material must belong to this course.",
                    status: 404
                });
            }
            const validatedQuery = stringField(
                { query },
                "query",
                { maxLength: 1000 }
            );
            const normalizedLimit = limit === undefined
                ? DEFAULT_RETRIEVAL_LIMIT
                : positiveInteger(limit, "limit");
            if (normalizedLimit > MAX_RETRIEVAL_LIMIT) {
                throw validationError(
                    `limit cannot exceed ${MAX_RETRIEVAL_LIMIT}.`,
                    { field: "limit", max: MAX_RETRIEVAL_LIMIT }
                );
            }

            return retrievalBackend.retrieve({
                courseId,
                userId,
                materialIds: uniqueIds,
                query: validatedQuery,
                limit: normalizedLimit
            });
        }
    };
}

module.exports = {
    DEFAULT_RETRIEVAL_LIMIT,
    MAX_RETRIEVAL_LIMIT,
    createRetrievalService
};
