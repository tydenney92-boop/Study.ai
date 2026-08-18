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

function createCourseService({ coursesRepository }) {
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

        delete(courseId, userId) {
            requireOwned(courseId, userId);

            if (coursesRepository.countMaterialsOwned(courseId, userId) > 0) {
                throw new AppError({
                    code: "COURSE_HAS_MATERIALS",
                    message: "Remove the course materials before deleting this course.",
                    status: 409
                });
            }

            coursesRepository.deleteOwned(courseId, userId);
        }
    };
}

module.exports = {
    createCourseService
};
