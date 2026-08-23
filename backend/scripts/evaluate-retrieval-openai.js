const { createOpenAiEmbeddingClient } = require("../src/services/openai-embedding-client");
const { rankLexicalChunks } = require("../src/services/lexical-retrieval-backend");
const { rankSemanticChunks } = require("../src/services/semantic-retrieval-backend");
const { combineHybridResults } = require("../src/services/hybrid-retrieval-backend");
const { evaluateRetrieval } = require("../src/services/retrieval-evaluation");
const { candidates, cases } = require("../evaluation/retrieval-fixtures");

async function main() {
    if (process.env.RUN_OPENAI_EMBEDDING_EVAL !== "1") {
        throw new Error("Set RUN_OPENAI_EMBEDDING_EVAL=1 to authorize the paid OpenAI evaluation.");
    }
    const client = createOpenAiEmbeddingClient({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_EMBEDDING_MODEL,
        dimensions: process.env.OPENAI_EMBEDDING_DIMENSIONS
            ? Number(process.env.OPENAI_EMBEDDING_DIMENSIONS) : null,
        timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS) || 30000
    });
    const documents = await client.embed(candidates.map(item => item.text));
    const queryEmbeddings = await client.embed(cases.map(item => item.query));
    const embedded = candidates.map((item, index) => ({ ...item, vector: documents.vectors[index] }));
    const lexical = item => rankLexicalChunks({ candidates, ...item, limit: 3 });
    const semantic = item => rankSemanticChunks({
        candidates: embedded.filter(candidate => item.materialIds.includes(candidate.materialId)),
        queryVector: queryEmbeddings.vectors[cases.indexOf(item)],
        materialIds: item.materialIds,
        limit: 3,
        minimumSimilarity: Number(process.env.RETRIEVAL_MINIMUM_SIMILARITY) || 0.15
    });
    const hybrid = item => combineHybridResults({
        lexical: lexical(item), semantic: semantic(item), semanticWeight: 0.65, limit: 3
    });
    const metrics = {
        lexical: await evaluateRetrieval({ cases, retrieve: lexical }),
        semantic: await evaluateRetrieval({ cases, retrieve: semantic }),
        hybrid: await evaluateRetrieval({ cases, retrieve: hybrid })
    };
    console.log(JSON.stringify({
        model: client.model,
        requests: 2,
        embeddedItems: candidates.length + cases.length,
        totalTokens: (documents.usage?.totalTokens || 0) + (queryEmbeddings.usage?.totalTokens || 0),
        metrics
    }, null, 2));
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
