const { rankLexicalChunks } = require("../src/services/lexical-retrieval-backend");
const { rankSemanticChunks } = require("../src/services/semantic-retrieval-backend");
const { combineHybridResults } = require("../src/services/hybrid-retrieval-backend");
const { evaluateRetrieval } = require("../src/services/retrieval-evaluation");
const {
    candidates,
    cases,
    createDeterministicEmbeddingClient
} = require("../evaluation/retrieval-fixtures");

async function main() {
    const client = createDeterministicEmbeddingClient();
    const vectors = (await client.embed(candidates.map(item => item.text))).vectors;
    const embedded = candidates.map((item, index) => ({ ...item, vector: vectors[index] }));
    const lexical = item => rankLexicalChunks({
        candidates: candidates.filter(candidate => item.materialIds.includes(candidate.materialId)),
        ...item,
        limit: 3
    });
    const semantic = async item => rankSemanticChunks({
        candidates: embedded.filter(candidate => item.materialIds.includes(candidate.materialId)),
        queryVector: (await client.embed([item.query])).vectors[0],
        materialIds: item.materialIds,
        limit: 3,
        minimumSimilarity: 0.15
    });
    const hybrid = async item => combineHybridResults({
        lexical: lexical(item),
        semantic: await semantic(item),
        semanticWeight: 0.65,
        limit: 3
    });
    const results = {
        lexical: await evaluateRetrieval({ cases, retrieve: lexical }),
        semantic: await evaluateRetrieval({ cases, retrieve: semantic }),
        hybrid: await evaluateRetrieval({ cases, retrieve: hybrid })
    };
    console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
