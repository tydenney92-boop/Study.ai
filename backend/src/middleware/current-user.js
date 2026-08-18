const { AppError } = require("../utils/app-error");

function createCurrentUserMiddleware({ usersRepository, developmentEmail }) {
    return function currentUser(req, res, next) {
        const user = usersRepository.findByEmail(developmentEmail);

        if (!user) {
            return next(new AppError({
                code: "DEVELOPMENT_USER_NOT_FOUND",
                message: "The temporary development user is not configured.",
                status: 500,
                expose: false
            }));
        }

        req.user = user;
        return next();
    };
}

module.exports = {
    createCurrentUserMiddleware
};
