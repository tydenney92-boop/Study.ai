const { createApp } = require("../src/app");

async function main() {
    const app = createApp();
    try {
        if (!app.locals.embeddingIndexingService.enabled) {
            throw new Error("Embedding indexing is disabled. Set EMBEDDINGS_ENABLED=true and configure the provider.");
        }
        const result = await app.locals.embeddingIndexingService.indexStale();
        console.log(JSON.stringify(result));
    } finally {
        app.locals.sessionStore?.close();
        app.locals.database.close();
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
