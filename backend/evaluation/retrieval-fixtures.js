const candidates = [
    { chunkId: 1, materialId: 1, chunkIndex: 0, text: "Opportunity cost is the value of the best alternative forgone when a choice is made." },
    { chunkId: 2, materialId: 1, chunkIndex: 1, text: "Scarcity requires people to make tradeoffs because resources are limited." },
    { chunkId: 3, materialId: 2, chunkIndex: 0, text: "Quantity demanded usually falls when a product's own price rises, holding other factors constant." },
    { chunkId: 4, materialId: 2, chunkIndex: 1, text: "A supply curve describes how sellers respond to market prices." },
    { chunkId: 5, materialId: 3, chunkIndex: 0, text: "Photosynthesis converts light energy into chemical energy in plant cells." }
];

const cases = [
    { name: "exact terminology", query: "opportunity cost", materialIds: [1, 2, 3], expectedChunkIds: [1] },
    { name: "paraphrase", query: "What do I sacrifice by selecting the next best choice?", materialIds: [1, 2], expectedChunkIds: [1] },
    { name: "synonym", query: "How do higher prices change consumer purchases?", materialIds: [1, 2], expectedChunkIds: [3] },
    { name: "multi material synthesis", query: "Compare resource sacrifice with buyer response to price", materialIds: [1, 2], expectedChunkIds: [1, 3] },
    { name: "irrelevant", query: "How does magma form igneous rock?", materialIds: [1, 2], expectedChunkIds: [] }
];

const CONCEPTS = [
    ["opportunity", "cost", "alternative", "forgone", "sacrifice", "choice", "selecting", "next", "best"],
    ["demand", "quantity", "consumer", "purchases", "buyer", "price", "prices", "falls", "higher", "rises"],
    ["scarcity", "tradeoff", "resources", "limited"],
    ["supply", "seller", "market"],
    ["photosynthesis", "light", "plant", "energy"]
];

function deterministicVector(text) {
    const terms = String(text).toLowerCase().match(/[a-z]+/g) || [];
    return CONCEPTS.map(concept => concept.reduce(
        (score, term) => score + (terms.includes(term) ? 1 : 0),
        0
    ));
}

function createDeterministicEmbeddingClient() {
    const calls = [];
    return {
        provider: "fake",
        model: "deterministic-eval-v1",
        calls,
        async embed(inputs) {
            calls.push([...inputs]);
            return {
                vectors: inputs.map(deterministicVector),
                usage: { totalTokens: inputs.reduce((total, value) => total + value.length / 4, 0) }
            };
        }
    };
}

module.exports = { candidates, cases, createDeterministicEmbeddingClient, deterministicVector };
