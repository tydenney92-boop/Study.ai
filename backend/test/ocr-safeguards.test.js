const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiUsageGuard } = require("../src/services/ai-usage-guard");
const { createOcrService } = require("../src/services/ocr.service");

function serviceWith({ provider, guard, maxTotalBytes = 100 }) {
    return createOcrService({
        provider,
        usageGuard: guard,
        maxImageBytes: 80,
        maxPdfPages: 2,
        maxTotalBytes,
        output: { log() {} }
    });
}

test("OCR rate limits are per authenticated user", async () => {
    const provider = {
        enabled: true,
        provider: "fake",
        async extractTextFromImage() { return "Readable text from the selected image notes."; }
    };
    const guard = createAiUsageGuard({
        windowMs: 60000,
        maxRequests: 1,
        maxConcurrentRequests: 1,
        namespace: "OCR",
        operationLabel: "Text recognition"
    });
    const service = serviceWith({ provider, guard });
    const input = { buffer: Buffer.from("image"), mimeType: "image/png", filename: "note.png" };
    await service.extractImage({ userId: 1, ...input });
    await assert.rejects(
        () => service.extractImage({ userId: 1, ...input }),
        error => error.code === "OCR_RATE_LIMIT_EXCEEDED"
    );
    await service.extractImage({ userId: 2, ...input });
});

test("OCR concurrency covers the whole operation and total bytes are bounded", async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const provider = {
        enabled: true,
        provider: "fake",
        async extractTextFromImage() { await pending; return "Readable OCR output for testing."; }
    };
    const guard = createAiUsageGuard({
        windowMs: 60000,
        maxRequests: 10,
        maxConcurrentRequests: 1,
        namespace: "OCR",
        operationLabel: "Text recognition"
    });
    const service = serviceWith({ provider, guard, maxTotalBytes: 10 });
    const first = service.extractImage({
        userId: 1,
        buffer: Buffer.from("small"),
        mimeType: "image/png",
        filename: "one.png"
    });
    await assert.rejects(() => service.extractImage({
        userId: 2,
        buffer: Buffer.from("small"),
        mimeType: "image/png",
        filename: "two.png"
    }), error => error.code === "OCR_CONCURRENCY_LIMIT_EXCEEDED");
    release();
    await first;
    await assert.rejects(() => service.extractPdfPages({
        userId: 3,
        filename: "scan.pdf",
        totalPages: 2,
        pages: [
            { pageNumber: 1, data: Buffer.from("123456") },
            { pageNumber: 2, data: Buffer.from("123456") }
        ]
    }), error => error.code === "OCR_TOTAL_TOO_LARGE");
});
