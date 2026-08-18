const { AppError } = require("../utils/app-error");

function translateUnitConstraint(error) {
    if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new AppError({
            code: "UNIT_NUMBER_CONFLICT",
            message: "That unit number already exists in this course.",
            status: 409
        });
    }

    throw error;
}

function createUnitService({ coursesService, unitsRepository }) {
    function requireOwned(unitId, courseId, userId) {
        coursesService.requireOwned(courseId, userId);
        const unit = unitsRepository.findOwned(unitId, courseId, userId);

        if (!unit) {
            throw new AppError({
                code: "UNIT_NOT_FOUND",
                message: "Unit not found in this course.",
                status: 404
            });
        }

        return unit;
    }

    return {
        requireOwned,

        list(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return unitsRepository.listOwned(courseId, userId);
        },

        create(courseId, userId, input) {
            coursesService.requireOwned(courseId, userId);

            try {
                const unitId = unitsRepository.create({ courseId, ...input });
                return unitsRepository.findOwned(unitId, courseId, userId);
            } catch (error) {
                return translateUnitConstraint(error);
            }
        },

        update(unitId, courseId, userId, changes) {
            requireOwned(unitId, courseId, userId);

            try {
                return unitsRepository.updateOwned(
                    unitId,
                    courseId,
                    userId,
                    changes
                );
            } catch (error) {
                return translateUnitConstraint(error);
            }
        },

        delete(unitId, courseId, userId) {
            requireOwned(unitId, courseId, userId);
            unitsRepository.deleteOwned(unitId, courseId, userId);
        }
    };
}

module.exports = {
    createUnitService
};
