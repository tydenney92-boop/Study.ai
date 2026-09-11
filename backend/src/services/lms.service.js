const { AppError } = require("../utils/app-error");

const REFRESH_EARLY_MS = 60 * 1000;

function createLmsService({
    repository,
    vault,
    registry,
    coursesService,
    oauthClient = null,
    clock = () => Date.now()
}) {
    const publicConnection = connection => ({
        id: connection.id,
        provider: connection.provider,
        baseUrl: connection.baseUrl,
        lastSyncedAt: connection.lastSyncedAt,
        status: connection.status,
        mappedCourseCount: Number(connection.mappedCourseCount || 0)
    });

    function owned(id, userId) {
        const connection = repository.findOwned(id, userId);
        if (!connection || connection.status === "disconnected") {
            throw new AppError({ code: "NOT_FOUND", message: "LMS connection not found.", status: 404 });
        }
        return connection;
    }

    function reconnectError() {
        return new AppError({
            code: "LMS_AUTH_EXPIRED",
            message: "Canvas connection expired. Reconnect Canvas.",
            status: 409
        });
    }

    async function refresh(connection, userId) {
        const encryptedRefreshToken = connection.refreshTokenEncrypted;
        if (!oauthClient || !encryptedRefreshToken) {
            repository.markStatus(connection.id, userId, "expired");
            throw reconnectError();
        }
        let result;
        try {
            result = await oauthClient.refresh(vault.decrypt(encryptedRefreshToken));
        } catch (_error) {
            repository.markStatus(connection.id, userId, "expired");
            throw reconnectError();
        }
        const refreshToken = result.refreshToken || vault.decrypt(encryptedRefreshToken);
        repository.updateTokens(connection.id, userId, {
            accessTokenEncrypted: vault.encrypt(result.accessToken),
            refreshTokenEncrypted: vault.encrypt(refreshToken),
            tokenExpiresAt: result.tokenExpiresAt
        });
        connection.accessTokenEncrypted = vault.encrypt(result.accessToken);
        connection.refreshTokenEncrypted = vault.encrypt(refreshToken);
        connection.tokenExpiresAt = result.tokenExpiresAt;
        connection.status = "connected";
        return result.accessToken;
    }

    async function provider(connection, userId) {
        let accessToken = vault.decrypt(connection.accessTokenEncrypted);
        if (!accessToken) throw reconnectError();
        const expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : NaN;
        if (Number.isFinite(expiresAt) && expiresAt <= clock() + REFRESH_EARLY_MS) {
            accessToken = await refresh(connection, userId);
        }
        return registry.create(connection, accessToken, {
            refreshAccessToken: () => refresh(connection, userId)
        });
    }

    function safeCourseFailure(error) {
        if (error instanceof AppError) return error.message;
        return "Canvas course could not be synced.";
    }

    return {
        list(userId) {
            return repository.listOwned(userId).map(publicConnection);
        },

        connect(userId, input) {
            return publicConnection(repository.saveConnection(userId, {
                provider: "canvas",
                baseUrl: input.baseUrl,
                accessTokenEncrypted: vault.encrypt(input.accessToken),
                refreshTokenEncrypted: vault.encrypt(input.refreshToken),
                tokenExpiresAt: input.tokenExpiresAt || null,
                providerUserId: input.providerUserId || null
            }));
        },

        async courses(id, userId) {
            const connection = owned(id, userId);
            try {
                return await (await provider(connection, userId)).listCourses();
            } catch (error) {
                if (error.code === "LMS_AUTH_EXPIRED") {
                    repository.markStatus(id, userId, "expired");
                    throw reconnectError();
                }
                repository.markStatus(id, userId, "error");
                throw error;
            }
        },

        map(id, userId, items) {
            owned(id, userId);
            if (!Array.isArray(items)) {
                throw new AppError({ code: "VALIDATION_ERROR", message: "Mappings must be an array.", status: 400 });
            }
            const externalIds = new Set();
            for (const item of items) {
                coursesService.requireOwned(Number(item.courseId), userId);
                if (!item.externalCourseId) {
                    throw new AppError({ code: "VALIDATION_ERROR", message: "External course ID is required.", status: 400 });
                }
                if (externalIds.has(String(item.externalCourseId))) {
                    throw new AppError({ code: "VALIDATION_ERROR", message: "A Canvas course can only be mapped once.", status: 400 });
                }
                externalIds.add(String(item.externalCourseId));
            }
            return repository.saveMappings(id, userId, items.map(item => ({
                ...item,
                externalCourseId: String(item.externalCourseId),
                externalCourseName: String(item.externalCourseName || "").slice(0, 200),
                courseId: Number(item.courseId)
            })));
        },

        mappings(id, userId) {
            owned(id, userId);
            return repository.listMappings(id, userId);
        },

        async sync(id, userId) {
            const connection = owned(id, userId);
            const mappings = repository.listMappings(id, userId);
            const summary = {
                courses: mappings.length,
                coursesChecked: 0,
                assignments: 0,
                created: 0,
                updated: 0,
                unchanged: 0,
                skipped: 0,
                removed: 0,
                failedCourses: [],
                connectionStatus: "connected",
                reconnectRequired: false
            };
            let canvasProvider;
            try {
                canvasProvider = await provider(connection, userId);
            } catch (error) {
                repository.markStatus(id, userId, "expired");
                summary.connectionStatus = "expired";
                summary.reconnectRequired = true;
                summary.failedCourses.push({ externalCourseId: null, message: reconnectError().message });
                return summary;
            }

            let successfulCourses = 0;
            for (const mapping of mappings) {
                summary.coursesChecked += 1;
                try {
                    const remoteTasks = await canvasProvider.listAssignments(mapping.externalCourseId);
                    summary.assignments += remoteTasks.length;
                    const result = repository.syncMapping(mapping, userId, remoteTasks);
                    for (const key of ["created", "updated", "unchanged", "skipped", "removed"]) {
                        summary[key] += result[key];
                    }
                    successfulCourses += 1;
                } catch (error) {
                    summary.failedCourses.push({
                        externalCourseId: mapping.externalCourseId,
                        message: safeCourseFailure(error)
                    });
                    if (error.code === "LMS_AUTH_EXPIRED") {
                        repository.markStatus(id, userId, "expired");
                        summary.connectionStatus = "expired";
                        summary.reconnectRequired = true;
                        break;
                    }
                }
            }

            if (!summary.reconnectRequired) {
                const status = summary.failedCourses.length ? "error" : "connected";
                repository.markStatus(id, userId, status, successfulCourses > 0 || mappings.length === 0);
                summary.connectionStatus = status;
            }
            return summary;
        },

        async disconnect(id, userId) {
            const connection = owned(id, userId);
            let tokenRevoked = false;
            if (oauthClient && connection.accessTokenEncrypted) {
                tokenRevoked = await oauthClient.revoke(vault.decrypt(connection.accessTokenEncrypted));
            }
            if (!repository.disconnect(id, userId)) {
                throw new AppError({ code: "NOT_FOUND", message: "LMS connection not found.", status: 404 });
            }
            return {
                disconnected: true,
                tokenRevoked,
                importedTasksRemain: true
            };
        },

        async smoke(id, userId) {
            const connection = owned(id, userId);
            const canvasProvider = await provider(connection, userId);
            const courses = await canvasProvider.listCourses();
            const mapping = repository.listMappings(id, userId)[0] || null;
            const assignments = mapping
                ? await canvasProvider.listAssignments(mapping.externalCourseId)
                : [];
            return {
                connectionId: connection.id,
                courseCount: courses.length,
                courseIds: courses.map(course => course.externalId),
                mappedCourseId: mapping?.externalCourseId || null,
                assignmentCount: assignments.length,
                assignmentIds: assignments.map(assignment => assignment.externalId)
            };
        },

        connectForTest(userId, input) {
            return this.connect(userId, {
                ...input,
                baseUrl: input.baseUrl || "https://canvas.test"
            });
        }
    };
}

module.exports = { createLmsService, REFRESH_EARLY_MS };
