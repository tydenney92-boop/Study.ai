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
const { createMaterialChunksRepository } = require("./repositories/material-chunks.repository");
const { createMaterialChunkEmbeddingsRepository } = require("./repositories/material-chunk-embeddings.repository");
const { createRecommendationsRepository } = require("./repositories/recommendations.repository");
const { createExamPlansRepository } = require("./repositories/exam-plans.repository");
const { createTasksRepository } = require("./repositories/tasks.repository");
const { createLmsRepository } = require("./repositories/lms.repository");
const { createScheduleImportRepository } = require("./repositories/schedule-import.repository");
const { createOnboardingRepository } = require("./repositories/onboarding.repository");
const { createAskNotesConversationsRepository } = require("./repositories/ask-notes-conversations.repository");
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
const { createAskNotesRetrievalContextService } = require("./services/ask-notes-retrieval-context.service");
const { createRecommendationsService } = require("./services/recommendations.service");
const { createExamPlanService } = require("./services/exam-plan.service");
const { createTaskService } = require("./services/task.service");
const { createDailyPlanService } = require("./services/daily-plan.service");
const { createLmsService } = require("./services/lms.service");
const { createScheduleImportService } = require("./services/schedule-import.service");
const { createOnboardingService } = require("./services/onboarding.service");
const { createCredentialVault } = require("./services/credential-vault");
const { createProviderRegistry } = require("./services/lms/provider-registry");
const { createExamScopeService } = require("./services/exam-scope.service");
const { createAskNotesConversationService } = require("./services/ask-notes-conversation.service");
const { createAskNotesFollowUpService } = require("./services/ask-notes-follow-up.service");
const { createStorageCleanupService } = require("./services/storage-cleanup.service");
const { SqliteSessionStore } = require("./services/sqlite-session-store");
const { createTextExtractionService } = require("./services/text-extraction.service");
const { createDocumentChunker } = require("./services/document-chunking.service");
const { createMaterialIndexingService } = require("./services/material-indexing.service");
const { createEmbeddingIndexingService } = require("./services/embedding-indexing.service");
const { createConfiguredEmbeddingClient } = require("./services/embedding-client-factory");
const { createConfiguredRetrievalBackend } = require("./services/retrieval-backend-factory");
const { createRetrievalService } = require("./services/retrieval.service");
const { createConfiguredStorage } = require("./services/storage-factory");
const { createConfiguredAiClient } = require("./services/ai-client-factory");
const { createAiUsageGuard } = require("./services/ai-usage-guard");
const { createConfiguredOcrProvider } = require("./services/ocr-provider-factory");
const { createOcrService } = require("./services/ocr.service");
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
const { createRecommendationsRouter } = require("./routes/recommendations.routes");
const { createExamPlanRouter } = require("./routes/exam-plan.routes");
const { createTasksRouter, createCourseTasksRouter } = require("./routes/tasks.routes");
const { createDailyPlanRouter } = require("./routes/daily-plan.routes");
const { createLmsRouter } = require("./routes/lms.routes");
const { createScheduleImportRouter } = require("./routes/schedule-import.routes");
const { createOnboardingRouter } = require("./routes/onboarding.routes");
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
const ocrOutput = options.ocrOutput || console;
const ocrProvider = options.ocrProvider !== undefined
    ? options.ocrProvider
    : createConfiguredOcrProvider(config, {
        client: options.ocrOpenAiClient,
        onUsage: options.onOcrUsage || (usage => ocrOutput.log(JSON.stringify({
            level: "info",
            event: "ocr_usage",
            provider: usage.provider,
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens
        })))
    });
const ocrUsageGuard = options.ocrUsageGuard || createAiUsageGuard({
    windowMs: config.ocrRateLimitWindowMs,
    maxRequests: config.ocrRateLimitMaxRequests,
    maxConcurrentRequests: config.ocrMaxConcurrentRequests,
    namespace: "OCR",
    operationLabel: "Text recognition"
});
const ocrService = createOcrService({
    provider: ocrProvider,
    usageGuard: ocrUsageGuard,
    maxImageBytes: config.ocrMaxImageBytes,
    maxPdfPages: config.ocrMaxPdfPages,
    maxTotalBytes: config.ocrMaxTotalBytes,
    output: ocrOutput
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
    storageCleanup: createStorageCleanupRepository(db),
    materialChunks: createMaterialChunksRepository(db),
    materialChunkEmbeddings: createMaterialChunkEmbeddingsRepository(db),
    recommendations: createRecommendationsRepository(db),
    examPlans: createExamPlansRepository(db),
    askNotesConversations: createAskNotesConversationsRepository(db),
    tasks: createTasksRepository(db),
    lms: createLmsRepository(db),
    scheduleImports: createScheduleImportRepository(db),
    onboarding: createOnboardingRepository(db)
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
const onboardingService = createOnboardingService({
    onboardingRepository: repositories.onboarding,
    coursesService,
    progressRepository: repositories.progress,
    tasksRepository: repositories.tasks,
    quizzesRepository: repositories.quizzes
});
const unitsService = createUnitService({
    coursesService,
    unitsRepository: repositories.units
});
const documentChunker = options.documentChunker || createDocumentChunker();
const materialIndexingService = createMaterialIndexingService({
    chunksRepository: repositories.materialChunks,
    documentChunker
});
materialIndexingService.rebuildStale();
const embeddingClient = options.embeddingClient !== undefined
    ? options.embeddingClient
    : createConfiguredEmbeddingClient(config);
const embeddingOutput = options.embeddingOutput || console;
const embeddingIndexingService = createEmbeddingIndexingService({
    repository: repositories.materialChunkEmbeddings,
    embeddingClient,
    embeddingVersion: config.embeddingVersion,
    batchSize: config.embeddingIndexBatchSize,
    maxChunks: config.embeddingIndexMaxChunks,
    output: embeddingOutput
});
const retrievalBackend = options.retrievalBackend || createConfiguredRetrievalBackend({
    config,
    chunksRepository: repositories.materialChunks,
    embeddingsRepository: repositories.materialChunkEmbeddings,
    embeddingClient,
    output: embeddingOutput
});
const retrievalService = createRetrievalService({
    coursesService,
    materialsRepository: repositories.materials,
    retrievalBackend
});
const textExtractionService =
    options.textExtractionService ||
    createTextExtractionService({ fileStorage, ocrService });
const materialService = createMaterialService({
    coursesRepository: repositories.courses,
    coursesService,
    unitsRepository: repositories.units,
    materialsRepository: repositories.materials,
    textExtractionService,
    materialIndexingService,
    embeddingIndexingService,
    fileStorage,
    storageCleanupRepository: repositories.storageCleanup,
    storageCleanupService,
    output: embeddingOutput
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
    progressRepository: repositories.progress,
    examPlansRepository: repositories.examPlans,
    tasksRepository: repositories.tasks
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
const askNotesConversationService = createAskNotesConversationService({
    coursesService,
    conversationsRepository: repositories.askNotesConversations,
    historyMaxTurns: config.askNotesHistoryMaxTurns
});
const askNotesFollowUpService = createAskNotesFollowUpService({
    maxTurns: config.askNotesHistoryMaxTurns,
    maxCharacters: config.askNotesHistoryMaxCharacters
});
const askNotesService = createAskNotesService({
    aiClient,
    retrievalContextService: createAskNotesRetrievalContextService({
        materialContextService,
        retrievalService,
        topK: config.askNotesRetrievalTopK,
        maxContextCharacters: config.aiMaxContextCharacters,
        output: options.askNotesOutput || console
    }),
    conversationService: askNotesConversationService,
    followUpService: askNotesFollowUpService
});
const recommendationsService = createRecommendationsService({
    coursesService,
    recommendationsRepository: repositories.recommendations,
    examPlansRepository: repositories.examPlans,
    examScopeService: createExamScopeService({ chunksRepository: repositories.materialChunks })
});
const dailyPlanService = createDailyPlanService({
    coursesService,
    tasksRepository: repositories.tasks,
    progressRepository: repositories.progress,
    recommendationsService,
    clock: options.clock
});
const examPlanService = createExamPlanService({
    coursesService,
    unitsRepository: repositories.units,
    materialsRepository: repositories.materials,
    examPlansRepository: repositories.examPlans
});
const taskService = createTaskService({
    coursesService,
    unitsRepository: repositories.units,
    materialsRepository: repositories.materials,
    tasksRepository: repositories.tasks
});
const lmsService = createLmsService({
    repository: repositories.lms,
    vault: createCredentialVault(config.lmsEncryptionKey || config.sessionSecret),
    registry: options.lmsProviderRegistry || createProviderRegistry({ fetchImpl: options.lmsFetch }),
    coursesService
});
app.locals.lmsService = lmsService;
const scheduleImportService = createScheduleImportService({
    coursesService,
    materialsRepository: repositories.materials,
    repository: repositories.scheduleImports
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
app.locals.materialIndexingService = materialIndexingService;
app.locals.embeddingIndexingService = embeddingIndexingService;
app.locals.embeddingClient = embeddingClient;
app.locals.retrievalService = retrievalService;
app.locals.ocrService = ocrService;

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
    res.json({
        maxUploadBytes: config.maxUploadBytes,
        ocrEnabled: config.ocrEnabled,
        ocrMaxImageBytes: config.ocrMaxImageBytes
    });
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
    createAskNotesRouter({
        askNotesService,
        conversationService: askNotesConversationService,
        aiUsageGuard
    })
);
app.use(
    "/api/courses/:courseId/recommendations",
    createRecommendationsRouter({ recommendationsService })
);
app.use(
    "/api/courses/:courseId/exam-plan",
    createExamPlanRouter({ examPlanService })
);
app.use(
    "/api/courses/:courseId/tasks",
    createCourseTasksRouter({ taskService })
);
app.use("/api/tasks", createTasksRouter({ taskService }));
app.use("/api/daily-plan", createDailyPlanRouter({ dailyPlanService }));
app.use("/api/onboarding", createOnboardingRouter({ onboardingService }));
app.use("/api/lms", createLmsRouter({ service: lmsService, config, fetchImpl: options.lmsFetch }));
app.use("/api/courses/:courseId/schedule-import", createScheduleImportRouter({ service: scheduleImportService }));
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
