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

function createCourseService({ coursesRepository, materialsRepository, fileStorage }) {
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
            coursesRepository.deleteOwned(courseId, userId);

            const results = await Promise.allSettled(
                storedFiles.map(file => fileStorage.remove(file.storedFilename))
            );
            const failed = results.filter(result => result.status === "rejected");
            if (failed.length > 0) {
                throw new AppError({
                    code: "COURSE_STORAGE_CLEANUP_FAILED",
                    message: "The course was deleted, but some uploaded files need cleanup.",
                    status: 500,
                    expose: false,
                    details: { failedFiles: failed.length }
                });
            }
        }
    };
}

module.exports = {
    createCourseService
};
