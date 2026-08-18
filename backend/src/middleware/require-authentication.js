const { AppError } = require("../utils/app-error");

function createRequireAuthentication({ usersRepository }) {
    return function requireAuthentication(req, res, next) {
        const userId = req.session?.userId;
        const user = userId ? usersRepository.findById(userId) : null;

        if (!user) {
            if (req.session) delete req.session.userId;
            return next(new AppError({
                code: "AUTHENTICATION_REQUIRED",
                message: "Log in to continue.",
                status: 401
            }));
        }

        req.user = user;
        return next();
    };
}

module.exports = { createRequireAuthentication };
