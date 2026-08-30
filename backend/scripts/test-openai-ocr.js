const { createOpenAiOcrProvider } = require("../src/services/openai-ocr-provider");
const { PNG_FIXTURE } = require("../test/helpers/image-fixtures");

async function main() {
    if (process.env.RUN_OPENAI_OCR_SMOKE !== "1") {
        throw new Error("Set RUN_OPENAI_OCR_SMOKE=1 to explicitly enable the paid OCR smoke test.");
    }
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL_OCR) {
        throw new Error("OPENAI_API_KEY and OPENAI_MODEL_OCR are required.");
    }
    let usage = null;
    const provider = createOpenAiOcrProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL_OCR,
        timeoutMs: Number(process.env.OCR_TIMEOUT_MS) || 60000,
        onUsage(value) { usage = value; }
    });
    const startedAt = Date.now();
    const text = await provider.extractTextFromImage({
        buffer: PNG_FIXTURE,
        mimeType: "image/png",
        filename: "local-ocr-smoke.png"
    });
    console.log(JSON.stringify({
        success: true,
        provider: "openai",
        model: process.env.OPENAI_MODEL_OCR,
        latencyMs: Date.now() - startedAt,
        extractedCharacterCount: text.length,
        requestCount: 1,
        inputTokens: usage?.inputTokens || 0,
        outputTokens: usage?.outputTokens || 0,
        totalTokens: usage?.totalTokens || 0
    }));
}

main().catch(error => {
    console.error(JSON.stringify({
        success: false,
        errorCode: error.code || "OCR_SMOKE_FAILED"
    }));
    process.exitCode = 1;
});
