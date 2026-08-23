function structuredLog(output, record) {
    output.log(JSON.stringify(record));
}

function createEmbeddingIndexingService({
    repository,
    embeddingClient,
    embeddingVersion,
    batchSize,
    maxChunks,
    output = console
}) {
    async function indexStale({ materialId, limit = maxChunks } = {}) {
        if (!embeddingClient) {
            return {
                enabled: false,
                embeddedChunks: 0,
                requests: 0,
                items: 0,
                failures: 0
            };
        }
        const started = process.hrtime.bigint();
        const stale = repository.listStale({
            provider: embeddingClient.provider,
            model: embeddingClient.model,
            embeddingVersion,
            materialId,
            limit: Math.min(limit, maxChunks)
        });
        let embeddedChunks = 0;
        let requests = 0;
        let items = 0;
        let failures = 0;
        let totalTokens = 0;

        try {
            for (let index = 0; index < stale.length; index += batchSize) {
                const batch = stale.slice(index, index + batchSize);
                requests++;
                items += batch.length;
                const result = await embeddingClient.embed(batch.map(chunk => chunk.text));
                totalTokens += result.usage?.totalTokens || 0;
                repository.upsertMany({
                    provider: embeddingClient.provider,
                    model: embeddingClient.model,
                    embeddingVersion,
                    items: batch.map((chunk, itemIndex) => ({
                        chunkId: chunk.chunkId,
                        contentHash: chunk.contentHash,
                        vector: result.vectors[itemIndex]
                    }))
                });
                embeddedChunks += batch.length;
            }
        } catch (error) {
            failures++;
            structuredLog(output, {
                level: "error",
                event: "embedding_index",
                provider: embeddingClient.provider,
                model: embeddingClient.model,
                embeddedChunks,
                requests,
                items,
                retries: 0,
                failures,
                durationMs: Number(
                    (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)
                ),
                errorCode: error.code || "EMBEDDING_INDEX_FAILED"
            });
            throw error;
        }

        const result = {
            enabled: true,
            provider: embeddingClient.provider,
            model: embeddingClient.model,
            embeddedChunks,
            requests,
            items,
            retries: 0,
            totalTokens,
            failures,
            durationMs: Number(
                (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)
            )
        };
        structuredLog(output, { level: "info", event: "embedding_index", ...result });
        return result;
    }

    return {
        enabled: Boolean(embeddingClient),
        indexMaterial(materialId) {
            return indexStale({ materialId, limit: maxChunks });
        },
        indexStale
    };
}

module.exports = { createEmbeddingIndexingService, structuredLog };
