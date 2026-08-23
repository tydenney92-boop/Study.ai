const { createLexicalRetrievalBackend } = require("./lexical-retrieval-backend");
const { createSemanticRetrievalBackend } = require("./semantic-retrieval-backend");
const { createHybridRetrievalBackend } = require("./hybrid-retrieval-backend");

function createFallbackBackend({ primary, fallback, output = console }) {
    return {
        mode: primary.mode,
        async retrieve(input) {
            try {
                const results = await primary.retrieve(input);
                return results;
            } catch (error) {
                output.log(JSON.stringify({
                    level: "warn",
                    event: "retrieval_fallback",
                    requestedMode: primary.mode,
                    fallbackMode: fallback.mode,
                    errorCode: error.code || "EMBEDDING_RETRIEVAL_FAILED"
                }));
            }
            return fallback.retrieve(input);
        }
    };
}

function createConfiguredRetrievalBackend({
    config,
    chunksRepository,
    embeddingsRepository,
    embeddingClient,
    output = console
}) {
    const lexical = createLexicalRetrievalBackend({ chunksRepository });
    if (!config.embeddingsEnabled || !embeddingClient || config.retrievalMode === "lexical") {
        return lexical;
    }
    const semantic = createSemanticRetrievalBackend({
        embeddingsRepository,
        embeddingClient,
        embeddingVersion: config.embeddingVersion,
        minimumSimilarity: config.retrievalMinimumSimilarity,
        output
    });
    const primary = config.retrievalMode === "hybrid"
        ? createHybridRetrievalBackend({
            lexicalBackend: lexical,
            semanticBackend: semantic,
            semanticWeight: config.retrievalHybridSemanticWeight
        })
        : semantic;
    return createFallbackBackend({ primary, fallback: lexical, output });
}

module.exports = { createConfiguredRetrievalBackend, createFallbackBackend };
