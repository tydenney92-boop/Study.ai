const express = require("express");
const cors = require("cors");
const session = require("express-session");
const defaultConfig = require("./config");
const { createConfiguredDatabase } = require("./database/database-factory");
const { runMigrations } = require("./database/migration-runner");
const { createUsersRepository } = require("./repositories/users.repository");
const { createCoursesRepository } = require("./repositories/courses.repository");
const { createUnitsRepository } = require("./repositories/units.repository");
const { createMaterialsRepository } = require("./repositories/materials.repository");
const { createStudyGuidesRepository } = require("./repositories/study-guides.repository");
const { createQuizzesRepository } = require("./repositories/quizzes.repository");
const { createQuizAttemptsRepository } = require("./repositories/quiz-attempts.repository");
const { createSessionsRepository } = require("./repositories/sessions.repository");
const { createProgressRepository } = require("./repositories/progress.repository");
const { createFlashcardsRepository } = require("./repositories/flashcards.repository");
const { createStorageCleanupRepository } = require("./repositories/storage-cleanup.repository");
const { createCourseService } = require("./services/course.service");
const { createUnitService } = require("./services/unit.service");
const { createMaterialService } = require("./services/material.service");
const { createMaterialContextService } = require("./services/material-context.service");
const { createStudyGuideService } = require("./services/study-guide.service");
const { createQuizGenerationService } = require("./services/quiz-generation.service");
const { createQuizAttemptService } = require("./services/quiz-attempt.service");
const { createAuthService } = require("./services/auth.service");
const { createGeneratedContentService } = require("./services/generated-content.service");
const { createProgressService } = require("./services/progress.service");
const { createFlashcardService } = require("./services/flashcard.service");
const { createFlashcardGenerationService } = require("./services/flashcard-generation.service");
const { createAskNotesService } = require("./services/ask-notes.service");
const { createStorageCleanupService } = require("./services/storage-cleanup.service");
const { SqliteSessionStore } = require("./services/sqlite-session-store");
const { createTextExtractionService } = require("./services/text-extraction.service");
const { createConfiguredStorage } = require("./services/storage-factory");
const { createConfiguredAiClient } = require("./services/ai-client-factory");
const { createAiUsageGuard } = require("./services/ai-usage-guard");
const { ALLOWED_EXTENSIONS } = require("./services/material-type");
const { createRequireAuthentication } = require("./middleware/require-authentication");
const { registerHealthRoutes } = require("./routes/health.routes");
const { createAuthRouter } = require("./routes/auth.routes");
const { createCoursesRouter } = require("./routes/courses.routes");
const { createUnitsRouter } = require("./routes/units.routes");
const { createCourseAiRouter, createLegacyAiRouter } = require("./routes/ai.routes");
const { createQuizAttemptsRouter } = require("./routes/quiz-attempts.routes");
const { createProgressRouter, createCourseProgressRouter } = require("./routes/progress.routes");
const { createFlashcardsRouter } = require("./routes/flashcards.routes");
const { createAskNotesRouter } = require("./routes/ask-notes.routes");
const { createStorageCleanupRouter } = require("./routes/storage-cleanup.routes");
const {
    createCourseMaterialsRouter,
    createLegacyMaterialsRouter
} = require("./routes/materials.routes");
const { notFoundHandler } = require("./middleware/not-found");
const { errorHandler } = require("./middleware/error-handler");
const { createRequestLogger } = require("./middleware/request-logger");
const { registerFrontendRoutes } = require("./routes/frontend.routes");

function createApp(options = {}) {

const config = {
    ...defaultConfig,
    ...(options.config || {})
};

if (!config.sessionSecret) {
    throw new Error("SESSION_SECRET is required in production.");
}

const app = express();

const db = options.database || createConfiguredDatabase(config);

const migrationResult = runMigrations({
    database: db,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory,
    createBackup: config.migrationBackup
});

const fileStorage =
    options.fileStorage ||
    createConfiguredStorage(config);

fileStorage.ensureReady();

const upload =
    options.uploadMiddleware ||
    fileStorage.createUploadMiddleware({
        maxFileSize: config.maxUploadBytes,
        allowedExtensions: ALLOWED_EXTENSIONS
    });

const aiClient =
    options.aiClient ||
    createConfiguredAiClient(config);
const aiUsageGuard = options.aiUsageGuard || createAiUsageGuard({
    windowMs: config.aiRateLimitWindowMs,
    maxRequests: config.aiRateLimitMaxRequests,
    maxConcurrentRequests: config.aiMaxConcurrentRequests
});

app.locals.database = db;
app.locals.fileStorage = fileStorage;
app.locals.migrations = migrationResult;
app.locals.config = config;

const defaultRepositories = {
    users: createUsersRepository(db),
    courses: createCoursesRepository(db),
    units: createUnitsRepository(db),
    materials: createMaterialsRepository(db),
    studyGuides: createStudyGuidesRepository(db),
    quizzes: createQuizzesRepository(db),
    quizAttempts: createQuizAttemptsRepository(db),
    sessions: createSessionsRepository(db),
    progress: createProgressRepository(db),
    flashcards: createFlashcardsRepository(db),
    storageCleanup: createStorageCleanupRepository(db)
};
const repositories = {
    ...defaultRepositories,
    ...(options.repositories || {}),
    ...(options.extendRepositories
        ? options.extendRepositories(defaultRepositories)
        : {})
};

const storageCleanupService = createStorageCleanupService({
    repository: repositories.storageCleanup,
    fileStorage
});
const coursesService = createCourseService({
    coursesRepository: repositories.courses,
    materialsRepository: repositories.materials,
    storageCleanupRepository: repositories.storageCleanup,
    storageCleanupService
});
const unitsService = createUnitService({
    coursesService,
    unitsRepository: repositories.units
});
const textExtractionService =
    options.textExtractionService ||
    createTextExtractionService({ fileStorage });
const materialService = createMaterialService({
    coursesRepository: repositories.courses,
    coursesService,
    unitsRepository: repositories.units,
    materialsRepository: repositories.materials,
    textExtractionService,
    fileStorage,
    storageCleanupRepository: repositories.storageCleanup,
    storageCleanupService
});
const materialContextService = createMaterialContextService({
    coursesService,
    materialsRepository: repositories.materials,
    maxContextCharacters: config.aiMaxContextCharacters
});
const studyGuideService = createStudyGuideService({
    aiClient,
    materialContextService,
    studyGuidesRepository: repositories.studyGuides,
    maxAttempts: config.aiStudyGuideMaxAttempts
});
const quizGenerationService = createQuizGenerationService({
    aiClient,
    materialContextService,
    quizzesRepository: repositories.quizzes,
    maxAttempts: config.aiQuizMaxAttempts,
    minQuestionCount: config.aiQuizMinQuestions,
    maxQuestionCount: config.aiQuizMaxQuestions
});
const quizAttemptService = createQuizAttemptService({
    quizzesRepository: repositories.quizzes,
    quizAttemptsRepository: repositories.quizAttempts
});
const generatedContentService = createGeneratedContentService({
    coursesService,
    studyGuidesRepository: repositories.studyGuides,
    quizzesRepository: repositories.quizzes,
    quizAttemptsRepository: repositories.quizAttempts
});
const progressService = createProgressService({
    coursesService,
    progressRepository: repositories.progress
});
const flashcardService = createFlashcardService({
    coursesService,
    materialService,
    flashcardsRepository: repositories.flashcards
});
const flashcardGenerationService = createFlashcardGenerationService({
    aiClient,
    materialContextService,
    flashcardsRepository: repositories.flashcards,
    minCards: config.aiFlashcardMinCards,
    maxCards: config.aiFlashcardMaxCards,
    defaultCards: config.aiFlashcardDefaultCards,
    maxAttempts: config.aiFlashcardMaxAttempts
});
const askNotesService = createAskNotesService({
    aiClient,
    materialContextService
});
const authService = createAuthService({
    usersRepository: repositories.users,
    passwordRounds: config.passwordRounds
});
const requireAuthentication = createRequireAuthentication({
    usersRepository: repositories.users
});
const sessionStore = options.sessionStore || new SqliteSessionStore({
    sessionsRepository: repositories.sessions,
    defaultTtlMs: config.sessionTtlMs
});
app.locals.sessionStore = sessionStore;

// =========================================
// MIDDLEWARE
// =========================================

app.set("trust proxy", config.trustProxyHops || false);
app.use(createRequestLogger({ environment: config.environment }));
app.use(cors({
    origin: config.frontendOrigin || config.appOrigin,
    credentials: true
}));

app.use(express.json());
app.use(session({
    name: config.sessionCookieName,
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.secureCookies,
        maxAge: config.sessionTtlMs,
        path: "/"
    }
}));


console.log(
    "Database connected."
);


console.log(
    "Materials table ready."
);


// =========================================
// TEST ROUTE
// =========================================

registerHealthRoutes(app, { database: db, fileStorage, config });

app.use("/api/auth", createAuthRouter({
    authService,
    requireAuthentication,
    cookieName: config.sessionCookieName
}));

if (config.serveFrontend) {
    registerFrontendRoutes(app, {
        frontendDirectory: config.frontendDirectory
    });
}

app.use("/api", requireAuthentication);

app.get("/api/client-config", function(req, res) {
    res.json({ maxUploadBytes: config.maxUploadBytes });
});

app.use(
    "/api/storage-cleanup",
    createStorageCleanupRouter({ storageCleanupService })
);

app.use(
    "/api/courses/:courseId/units",
    createUnitsRouter({ unitsService })
);

app.use(
    "/api/courses/:courseId/materials",
    createCourseMaterialsRouter({ materialService, upload })
);
app.use(
    "/api/courses/:courseId/flashcards",
    createFlashcardsRouter({
        flashcardService,
        flashcardGenerationService,
        aiUsageGuard
    })
);
app.use(
    "/api/courses/:courseId/ask",
    createAskNotesRouter({ askNotesService, aiUsageGuard })
);
app.use(
    "/api/courses",
    createCoursesRouter({ coursesService })
);
app.use(
    "/api/courses/:courseId",
    createCourseAiRouter({
        studyGuideService,
        quizGenerationService,
        generatedContentService,
        aiUsageGuard
    })
);
app.use(
    "/api/materials",
    createLegacyMaterialsRouter({ materialService, upload })
);
app.use(
    "/api/quizzes/:quizId/attempts",
    createQuizAttemptsRouter({ quizAttemptService })
);
app.use("/api/progress", createProgressRouter({ progressService }));
app.use(
    "/api/courses/:courseId/progress",
    createCourseProgressRouter({ progressService })
);
app.use(
    "/api",
    createLegacyAiRouter({
        materialService,
        studyGuideService,
        quizGenerationService,
        aiUsageGuard
    })
);

if (typeof options.registerTestRoutes === "function") {
    options.registerTestRoutes(app);
}

app.use(notFoundHandler);
app.use(errorHandler);

return app;

}

module.exports = {
    createApp
};
