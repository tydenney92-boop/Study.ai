const bcrypt = require("bcryptjs");
const { AppError } = require("../utils/app-error");
const { requestObject, stringField, validationError } = require("../utils/validation");

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
    };
}

function credentials(body, { includeName = false, requireStrongPassword = false } = {}) {
    const value = requestObject(body);
    const email = stringField(value, "email", { maxLength: 254 }).toLowerCase();
    const password = stringField(value, "password", { maxLength: 128 });
    const name = includeName
        ? stringField(value, "name", { maxLength: 100 })
        : undefined;

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        throw validationError("Enter a valid email address.", { field: "email" });
    }
    if (requireStrongPassword && password.length < 8) {
        throw validationError("Password must be at least 8 characters.", {
            field: "password"
        });
    }

    return { name, email, password };
}

function createAuthService({ usersRepository, passwordRounds = 12 }) {
    return {
        async register(body) {
            const value = credentials(body, {
                includeName: true,
                requireStrongPassword: true
            });
            if (usersRepository.findByEmail(value.email)) {
                throw new AppError({
                    code: "EMAIL_ALREADY_REGISTERED",
                    message: "An account with this email already exists.",
                    status: 409
                });
            }

            const passwordHash = await bcrypt.hash(value.password, passwordRounds);
            try {
                return publicUser(usersRepository.create({
                    name: value.name,
                    email: value.email,
                    passwordHash
                }));
            } catch (error) {
                if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                    throw new AppError({
                        code: "EMAIL_ALREADY_REGISTERED",
                        message: "An account with this email already exists.",
                        status: 409
                    });
                }
                throw error;
            }
        },

        async login(body) {
            const value = credentials(body);
            const user = usersRepository.findByEmail(value.email);
            const valid = user?.passwordHash
                ? await bcrypt.compare(value.password, user.passwordHash)
                : false;

            if (!valid) {
                throw new AppError({
                    code: "INVALID_CREDENTIALS",
                    message: "Email or password is incorrect.",
                    status: 401
                });
            }
            return publicUser(user);
        },

        publicUser
    };
}

module.exports = { createAuthService, publicUser };
