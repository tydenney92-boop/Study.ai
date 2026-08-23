const path = require("path");
const { runAskNotesEvaluation } = require("../evaluation/ask-notes-evaluator");
const {
    createDeterministicCourseEmbeddingClient
} = require("../evaluation/deterministic-course-embedding-client");
const { publicSummary, writeEvaluationReport } = require("../evaluation/report-writer");

function deterministicAnswerGenerator() {
    return async ({ question }) => ({
        text: JSON.stringify({
            answer: question.expectedBehavior === "not_found"
                ? "The selected materials do not contain enough information."
                : question.referenceAnswer,
            supportType: question.expectedBehavior
        }),
        usage: {
            inputTokens: 0,
            outputTokens: 0
        }
    });
}

async function main() {
    const manifestPath = process.env.RAG_EVAL_MANIFEST || process.argv[2] ||
        path.resolve(__dirname, "../evaluation/ask-notes-sample/manifest.json");
    const report = await runAskNotesEvaluation({
        manifestPath,
        embeddingClient: createDeterministicCourseEmbeddingClient(),
        answerGenerator: deterministicAnswerGenerator(),
        topK: Number(process.env.AI_ASK_NOTES_RETRIEVAL_TOP_K) || 6,
        minimumSimilarity: Number(process.env.RETRIEVAL_MINIMUM_SIMILARITY) || 0.15,
        hybridSemanticWeight: Number(process.env.RETRIEVAL_HYBRID_SEMANTIC_WEIGHT) || 0.65,
        answerMode: process.env.RAG_EVAL_ANSWER_MODE || "semantic"
    });
    const outputPath = writeEvaluationReport(report, process.env.RAG_EVAL_OUTPUT);
    console.log(JSON.stringify({ reportPath: outputPath, ...publicSummary(report) }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { deterministicAnswerGenerator, main };
