const { AppError } = require("../utils/app-error");

function translateCourseConstraint(error) {
    if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new AppError({
            code: "COURSE_ALREADY_EXISTS",
            message: "A course with that code and semester already exists.",
            status: 409
        });
    }

    throw error;
}

function createCourseService({
    coursesRepository,
    materialsRepository,
    storageCleanupRepository,
    storageCleanupService
}) {
    function requireOwned(courseId, userId) {
        const course = coursesRepository.findOwned(courseId, userId);

        if (!course) {
            throw new AppError({
                code: "COURSE_NOT_FOUND",
                message: "Course not found.",
                status: 404
            });
        }

        return course;
    }

    return {
        requireOwned,

        list(userId) {
            return coursesRepository.listByUser(userId);
        },

        summaries(userId) {
            return coursesRepository.listSummariesByUser(userId);
        },

        create(userId, input) {
            try {
                return coursesRepository.create({ userId, ...input });
            } catch (error) {
                return translateCourseConstraint(error);
            }
        },

        update(courseId, userId, changes) {
            requireOwned(courseId, userId);

            try {
                return coursesRepository.updateOwned(courseId, userId, changes);
            } catch (error) {
                return translateCourseConstraint(error);
            }
        },

        markOpened(courseId, userId) {
            requireOwned(courseId, userId);
            coursesRepository.markOpenedOwned(courseId, userId);
            return coursesRepository.findOwned(courseId, userId);
        },

        async delete(courseId, userId) {
            requireOwned(courseId, userId);
            const storedFiles = materialsRepository.listStoredFilenamesOwned(
                courseId,
                userId
            );
            const jobs = storageCleanupRepository.deleteCourseWithCleanup({
                courseId,
                userId,
                filenames: storedFiles.map(file => file.storedFilename)
            });
            return storageCleanupService.reconcileJobs(jobs);
        }
    };
}

module.exports = {
    createCourseService
};
