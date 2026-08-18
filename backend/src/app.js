const express = require("express");
const cors = require("cors");
const defaultConfig = require("./config");
const { createDatabase } = require("./database/connection");
const { runMigrations } = require("./database/migration-runner");
const { createUsersRepository } = require("./repositories/users.repository");
const { createCoursesRepository } = require("./repositories/courses.repository");
const { createUnitsRepository } = require("./repositories/units.repository");
const { createMaterialsRepository } = require("./repositories/materials.repository");
const { createStudyGuidesRepository } = require("./repositories/study-guides.repository");
const { createQuizzesRepository } = require("./repositories/quizzes.repository");
const { createQuizAttemptsRepository } = require("./repositories/quiz-attempts.repository");
const { createCourseService } = require("./services/course.service");
const { createUnitService } = require("./services/unit.service");
const { createMaterialService } = require("./services/material.service");
const { createMaterialContextService } = require("./services/material-context.service");
const { createStudyGuideService } = require("./services/study-guide.service");
const { createQuizGenerationService } = require("./services/quiz-generation.service");
const { createQuizAttemptService } = require("./services/quiz-attempt.service");
const { createTextExtractionService } = require("./services/text-extraction.service");
const { createLocalFileStorage } = require("./services/local-file-storage");
const { createOllamaClient } = require("./services/ollama-client");
const { ALLOWED_EXTENSIONS } = require("./services/material-type");
const { createCurrentUserMiddleware } = require("./middleware/current-user");
const { registerHealthRoutes } = require("./routes/health.routes");
const { createCoursesRouter } = require("./routes/courses.routes");
const { createUnitsRouter } = require("./routes/units.routes");
const { createCourseAiRouter, createLegacyAiRouter } = require("./routes/ai.routes");
const { createQuizAttemptsRouter } = require("./routes/quiz-attempts.routes");
const {
    createCourseMaterialsRouter,
    createLegacyMaterialsRouter
} = require("./routes/materials.routes");
const { notFoundHandler } = require("./middleware/not-found");
const { errorHandler } = require("./middleware/error-handler");

function createApp(options = {}) {

const config = {
    ...defaultConfig,
    ...(options.config || {})
};

const app = express();

const db = options.database || createDatabase(config.databasePath);

const migrationResult = runMigrations({
    database: db,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory,
    createBackup: config.migrationBackup
});

const fileStorage =
    options.fileStorage ||
    createLocalFileStorage({
        uploadDirectory: config.uploadDirectory
    });

fileStorage.ensureReady();

const upload =
    options.uploadMiddleware ||
    fileStorage.createUploadMiddleware({
        maxFileSize: config.maxUploadBytes,
        allowedExtensions: ALLOWED_EXTENSIONS
    });

const aiClient =
    options.aiClient ||
    createOllamaClient({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
        timeoutMs: config.aiTimeoutMs
    });

app.locals.database = db;
app.locals.fileStorage = fileStorage;
app.locals.migrations = migrationResult;

const defaultRepositories = {
    users: createUsersRepository(db),
    courses: createCoursesRepository(db),
    units: createUnitsRepository(db),
    materials: createMaterialsRepository(db),
    studyGuides: createStudyGuidesRepository(db),
    quizzes: createQuizzesRepository(db),
    quizAttempts: createQuizAttemptsRepository(db)
};
const repositories = {
    ...defaultRepositories,
    ...(options.repositories || {}),
    ...(options.extendRepositories
        ? options.extendRepositories(defaultRepositories)
        : {})
};

const coursesService = createCourseService({
    coursesRepository: repositories.courses
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
    fileStorage
});
const materialContextService = createMaterialContextService({
    coursesService,
    materialsRepository: repositories.materials
});
const studyGuideService = createStudyGuideService({
    aiClient,
    materialContextService,
    studyGuidesRepository: repositories.studyGuides
});
const quizGenerationService = createQuizGenerationService({
    aiClient,
    materialContextService,
    quizzesRepository: repositories.quizzes
});
const quizAttemptService = createQuizAttemptService({
    quizzesRepository: repositories.quizzes,
    quizAttemptsRepository: repositories.quizAttempts
});

// =========================================
// MIDDLEWARE
// =========================================

app.use(cors());

app.use(express.json());


console.log(
    "Database connected."
);


console.log(
    "Materials table ready."
);


// =========================================
// TEST ROUTE
// =========================================

registerHealthRoutes(app);

app.use(createCurrentUserMiddleware({
    usersRepository: repositories.users,
    developmentEmail: config.developmentUserEmail
}));

app.use(
    "/api/courses/:courseId/units",
    createUnitsRouter({ unitsService })
);
app.use(
    "/api/courses/:courseId/materials",
    createCourseMaterialsRouter({ materialService, upload })
);
app.use(
    "/api/courses/:courseId",
    createCourseAiRouter({ studyGuideService, quizGenerationService })
);
app.use(
    "/api/courses",
    createCoursesRouter({ coursesService })
);
app.use(
    "/api/materials",
    createLegacyMaterialsRouter({ materialService, upload })
);
app.use(
    "/api/quizzes/:quizId/attempts",
    createQuizAttemptsRouter({ quizAttemptService })
);
app.use(
    "/api",
    createLegacyAiRouter({
        materialService,
        studyGuideService,
        quizGenerationService
    })
);


app.use(notFoundHandler);
app.use(errorHandler);

return app;

}

module.exports = {
    createApp
};
