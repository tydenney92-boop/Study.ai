const CONCEPT_GROUPS = [
    ["opportunity", "forgone", "alternative", "sacrifice", "sacrificed", "choice", "road", "taken", "choosing"],
    ["elastic", "elasticity", "responsive", "responsiveness", "adjust", "behavior", "burden", "tax"],
    ["inflation", "price", "prices", "demand-pull", "general", "expensive"],
    ["monetary", "central", "bank", "interest", "borrowing", "policy", "lag", "immediately"],
    ["demand", "quantity", "buyer", "buyers", "purchase", "purchases", "curve"],
    ["ceiling", "shortage", "equilibrium", "supplied", "demanded"],
    ["causal", "caused", "cause", "correlation", "counterfactual", "confounding"],
    ["gdp", "gross", "domestic", "nominal", "real", "production", "current", "today", "dollars", "measure"]
];

function vectorize(text) {
    const terms = String(text).toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) || [];
    const vector = CONCEPT_GROUPS.map(group => group.reduce(
        (score, term) => score + (terms.includes(term) ? 1 : 0),
        0
    ));
    return vector;
}

function createDeterministicCourseEmbeddingClient() {
    const usage = { requests: 0, items: 0, totalTokens: 0 };
    return {
        provider: "fake",
        model: "deterministic-course-v1",
        usage,
        async embed(inputs) {
            usage.requests++;
            usage.items += inputs.length;
            const tokens = inputs.reduce((total, text) => total + Math.ceil(text.length / 4), 0);
            usage.totalTokens += tokens;
            return {
                vectors: inputs.map(vectorize),
                usage: { totalTokens: tokens }
            };
        }
    };
}

module.exports = { CONCEPT_GROUPS, createDeterministicCourseEmbeddingClient, vectorize };
