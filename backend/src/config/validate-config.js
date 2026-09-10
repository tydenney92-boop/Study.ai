const path = require("path");

function required(value, name, errors) {
    if (value === undefined || value === null || value === "") {
        errors.push(`${name} is required.`);
    }
}

function positiveInteger(value, name, errors) {
    if (!Number.isInteger(value) || value < 1) {
        errors.push(`${name} must be a positive integer.`);
    }
}

function validateProductionConfig(config) {
    const errors = [];
    required(config.appOrigin, "APP_ORIGIN", errors);
    required(config.sessionSecret, "SESSION_SECRET", errors);
    required(config.databasePath, "DATABASE_PATH", errors);
    required(config.databaseDriver, "DATABASE_DRIVER", errors);
    required(config.backupDirectory, "DATABASE_BACKUP_DIRECTORY", errors);
    required(config.storageDriver, "STORAGE_DRIVER", errors);
    required(config.aiProvider, "AI_PROVIDER", errors);
    required(config.aiEnabled, "AI_ENABLED", errors);

    if (config.sessionSecret && config.sessionSecret.length < 32) {
        errors.push("SESSION_SECRET must contain at least 32 characters.");
    }
    if (!config.secureCookies) {
        errors.push("SECURE_COOKIES must be enabled in production.");
    }
    if (!Number.isInteger(config.trustProxyHops) || config.trustProxyHops < 1) {
        errors.push("TRUST_PROXY_HOPS must be at least 1 in production.");
    }
    if (!config.serveFrontend) {
        errors.push("SERVE_FRONTEND must be enabled for the single-domain deployment.");
    }
    if (config.appOrigin && !/^https:\/\//i.test(config.appOrigin)) {
        errors.push("APP_ORIGIN must use HTTPS in production.");
    }
    if (config.databaseDriver && config.databaseDriver !== "sqlite") {
        errors.push("DATABASE_DRIVER currently supports only sqlite.");
    }
    if (config.databasePath && !path.isAbsolute(config.databasePath)) {
        errors.push("DATABASE_PATH must be absolute in production.");
    }
    if (config.backupDirectory && !path.isAbsolute(config.backupDirectory)) {
        errors.push("DATABASE_BACKUP_DIRECTORY must be absolute in production.");
    }
    if (config.storageDriver === "local") {
        required(config.uploadDirectory, "UPLOAD_DIRECTORY", errors);
        if (config.uploadDirectory && !path.isAbsolute(config.uploadDirectory)) {
            errors.push("UPLOAD_DIRECTORY must be an absolute persistent path.");
        }
    } else if (config.storageDriver === "s3") {
        required(config.objectStorageBucket, "OBJECT_STORAGE_BUCKET", errors);
        required(config.objectStorageRegion, "OBJECT_STORAGE_REGION", errors);
    } else if (config.storageDriver) {
        errors.push("STORAGE_DRIVER must be local or s3.");
    }
    if (Boolean(config.objectStorageAccessKeyId) !== Boolean(config.objectStorageSecretAccessKey)) {
        errors.push("Object-storage access key and secret must be provided together.");
    }
    const canvasConfigured = [config.canvasClientId, config.canvasClientSecret,
        config.canvasBaseUrl, config.canvasRedirectUri].some(Boolean);
    if (canvasConfigured) {
        required(config.canvasClientId, "CANVAS_CLIENT_ID", errors);
        required(config.canvasClientSecret, "CANVAS_CLIENT_SECRET", errors);
        required(config.canvasBaseUrl, "CANVAS_BASE_URL", errors);
        required(config.canvasRedirectUri, "CANVAS_REDIRECT_URI", errors);
        required(config.lmsEncryptionKey, "LMS_ENCRYPTION_KEY", errors);
        if (config.canvasBaseUrl && !/^https:\/\//i.test(config.canvasBaseUrl)) {
            errors.push("CANVAS_BASE_URL must use HTTPS in production.");
        }
        if (config.canvasRedirectUri && !/^https:\/\//i.test(config.canvasRedirectUri)) {
            errors.push("CANVAS_REDIRECT_URI must use HTTPS in production.");
        }
    }
    if (config.lmsEncryptionKey && config.lmsEncryptionKey.length < 32) {
        errors.push("LMS_ENCRYPTION_KEY must contain at least 32 characters.");
    }
    if (config.aiProvider && !["ollama", "openai"].includes(config.aiProvider)) {
        errors.push("AI_PROVIDER must be ollama or openai.");
    }
    if (config.ocrProvider && config.ocrProvider !== "openai") {
        errors.push("OCR_PROVIDER currently supports only openai.");
    }
    if (config.ocrEnabled === true) {
        required(config.ocrProvider, "OCR_PROVIDER", errors);
        required(config.openAiApiKey, "OPENAI_API_KEY", errors);
        required(config.openAiOcrModel, "OPENAI_MODEL_OCR", errors);
    }
    if (config.embeddingsProvider && config.embeddingsProvider !== "openai") {
        errors.push("EMBEDDINGS_PROVIDER currently supports only openai.");
    }
    if (config.retrievalMode &&
        !["lexical", "semantic", "hybrid"].includes(config.retrievalMode)) {
        errors.push("RETRIEVAL_MODE must be lexical, semantic, or hybrid.");
    }
    if (config.embeddingsEnabled === true) {
        required(config.embeddingsProvider, "EMBEDDINGS_PROVIDER", errors);
        required(config.openAiApiKey, "OPENAI_API_KEY", errors);
        required(config.openAiEmbeddingModel, "OPENAI_EMBEDDING_MODEL", errors);
    }
    if (config.aiEnabled === true && config.aiProvider === "ollama") {
        required(config.ollamaBaseUrl, "OLLAMA_BASE_URL", errors);
        required(config.ollamaModel, "OLLAMA_MODEL", errors);
    }
    if (config.aiEnabled === true && config.aiProvider === "openai") {
        required(config.openAiApiKey, "OPENAI_API_KEY", errors);
        required(
            config.openAiModels?.fast || config.openAiModel,
            "OPENAI_MODEL_FAST or OPENAI_MODEL",
            errors
        );
        required(
            config.openAiModels?.standard || config.openAiModel,
            "OPENAI_MODEL_STANDARD or OPENAI_MODEL",
            errors
        );
        required(
            config.openAiModels?.advanced || config.openAiModel,
            "OPENAI_MODEL_ADVANCED or OPENAI_MODEL",
            errors
        );
    }
    positiveInteger(config.aiTimeoutMs, "AI_TIMEOUT_MS", errors);
    positiveInteger(config.aiRateLimitWindowMs, "AI_RATE_LIMIT_WINDOW_MS", errors);
    positiveInteger(config.aiRateLimitMaxRequests, "AI_RATE_LIMIT_MAX_REQUESTS", errors);
    positiveInteger(config.aiMaxConcurrentRequests, "AI_MAX_CONCURRENT_REQUESTS", errors);
    positiveInteger(config.aiMaxContextCharacters, "AI_MAX_CONTEXT_CHARACTERS", errors);
    positiveInteger(config.aiQuizMinQuestions, "AI_QUIZ_MIN_QUESTIONS", errors);
    positiveInteger(config.aiQuizMaxQuestions, "AI_QUIZ_MAX_QUESTIONS", errors);
    positiveInteger(config.aiQuizMaxAttempts, "AI_QUIZ_MAX_ATTEMPTS", errors);
    positiveInteger(config.aiStudyGuideMaxAttempts, "AI_STUDY_GUIDE_MAX_ATTEMPTS", errors);
    positiveInteger(config.aiFlashcardMinCards, "AI_FLASHCARD_MIN_CARDS", errors);
    positiveInteger(config.aiFlashcardMaxCards, "AI_FLASHCARD_MAX_CARDS", errors);
    positiveInteger(config.aiFlashcardDefaultCards, "AI_FLASHCARD_DEFAULT_CARDS", errors);
    positiveInteger(config.aiFlashcardMaxAttempts, "AI_FLASHCARD_MAX_ATTEMPTS", errors);
    positiveInteger(config.ocrMaxImageBytes, "OCR_MAX_IMAGE_BYTES", errors);
    positiveInteger(config.ocrMaxPdfPages, "OCR_MAX_PDF_PAGES", errors);
    positiveInteger(config.ocrMaxTotalBytes, "OCR_MAX_TOTAL_BYTES", errors);
    positiveInteger(config.ocrTimeoutMs, "OCR_TIMEOUT_MS", errors);
    positiveInteger(config.ocrMaxConcurrentRequests, "OCR_MAX_CONCURRENT_REQUESTS", errors);
    positiveInteger(config.ocrRateLimitWindowMs, "OCR_RATE_LIMIT_WINDOW_MS", errors);
    positiveInteger(config.ocrRateLimitMaxRequests, "OCR_RATE_LIMIT_MAX_REQUESTS", errors);
    positiveInteger(config.embeddingVersion, "EMBEDDING_VERSION", errors);
    positiveInteger(config.embeddingTimeoutMs, "EMBEDDING_TIMEOUT_MS", errors);
    positiveInteger(config.embeddingIndexBatchSize, "EMBEDDING_INDEX_BATCH_SIZE", errors);
    positiveInteger(config.embeddingIndexMaxChunks, "EMBEDDING_INDEX_MAX_CHUNKS", errors);
    positiveInteger(config.askNotesRetrievalTopK, "AI_ASK_NOTES_RETRIEVAL_TOP_K", errors);
    positiveInteger(config.askNotesHistoryMaxTurns, "AI_ASK_NOTES_HISTORY_MAX_TURNS", errors);
    positiveInteger(
        config.askNotesHistoryMaxCharacters,
        "AI_ASK_NOTES_HISTORY_MAX_CHARACTERS",
        errors
    );
    if (Number.isInteger(config.askNotesRetrievalTopK) && config.askNotesRetrievalTopK > 20) {
        errors.push("AI_ASK_NOTES_RETRIEVAL_TOP_K cannot exceed 20.");
    }
    if (Number.isInteger(config.askNotesHistoryMaxTurns) && config.askNotesHistoryMaxTurns > 20) {
        errors.push("AI_ASK_NOTES_HISTORY_MAX_TURNS cannot exceed 20.");
    }
    if (Number.isInteger(config.askNotesHistoryMaxCharacters) &&
        config.askNotesHistoryMaxCharacters > 20000) {
        errors.push("AI_ASK_NOTES_HISTORY_MAX_CHARACTERS cannot exceed 20000.");
    }
    if (config.openAiEmbeddingDimensions !== null &&
        config.openAiEmbeddingDimensions !== undefined) {
        positiveInteger(
            config.openAiEmbeddingDimensions,
            "OPENAI_EMBEDDING_DIMENSIONS",
            errors
        );
    }
    if (!Number.isFinite(config.retrievalHybridSemanticWeight) ||
        config.retrievalHybridSemanticWeight < 0 ||
        config.retrievalHybridSemanticWeight > 1) {
        errors.push("RETRIEVAL_HYBRID_SEMANTIC_WEIGHT must be between 0 and 1.");
    }
    if (!Number.isFinite(config.retrievalMinimumSimilarity) ||
        config.retrievalMinimumSimilarity < -1 ||
        config.retrievalMinimumSimilarity > 1) {
        errors.push("RETRIEVAL_MINIMUM_SIMILARITY must be between -1 and 1.");
    }
    if (config.aiQuizMinQuestions > config.aiQuizMaxQuestions) {
        errors.push("AI_QUIZ_MIN_QUESTIONS cannot exceed AI_QUIZ_MAX_QUESTIONS.");
    }
    if (![5, 10, 15, 20].some(count =>
        count >= config.aiQuizMinQuestions && count <= config.aiQuizMaxQuestions
    )) {
        errors.push("The configured quiz range must include 5, 10, 15, or 20 questions.");
    }
    if (config.aiFlashcardMinCards > config.aiFlashcardMaxCards) {
        errors.push("AI_FLASHCARD_MIN_CARDS cannot exceed AI_FLASHCARD_MAX_CARDS.");
    }
    if (config.ocrMaxImageBytes > config.ocrMaxTotalBytes) {
        errors.push("OCR_MAX_IMAGE_BYTES cannot exceed OCR_MAX_TOTAL_BYTES.");
    }
    if (
        config.aiFlashcardDefaultCards < config.aiFlashcardMinCards ||
        config.aiFlashcardDefaultCards > config.aiFlashcardMaxCards
    ) {
        errors.push("AI_FLASHCARD_DEFAULT_CARDS must be within the configured flashcard range.");
    }

    if (errors.length > 0) {
        const error = new Error(`Invalid production configuration: ${errors.join(" ")}`);
        error.code = "INVALID_PRODUCTION_CONFIG";
        throw error;
    }
    return config;
}

module.exports = { validateProductionConfig };
