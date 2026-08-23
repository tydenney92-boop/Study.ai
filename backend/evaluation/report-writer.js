const fs = require("fs");
const path = require("path");

function defaultReportPath(prefix = "ask-notes-evaluation") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.resolve(__dirname, "..", "evaluation-output", `${prefix}-${timestamp}.json`);
}

function writeEvaluationReport(report, outputPath) {
    const target = path.resolve(outputPath || defaultReportPath());
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    return target;
}

function publicSummary(report) {
    return {
        corpus: report.corpus,
        settings: report.settings,
        retrievalMetrics: report.retrievalMetrics,
        retrievalMetricsByCategory: report.retrievalMetricsByCategory,
        summary: report.summary
    };
}

module.exports = { defaultReportPath, publicSummary, writeEvaluationReport };
