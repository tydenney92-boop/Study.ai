const test = require("node:test");
const assert = require("node:assert/strict");
const {
    OCR_TRANSCRIPTION_PROMPT,
    createOpenAiOcrProvider,
    normalizeOcrProviderError
} = require("../src/services/openai-ocr-provider");
const { createConfiguredOcrProvider } = require("../src/services/ocr-provider-factory");
const { PNG_FIXTURE } = require("./helpers/image-fixtures");

test("OpenAI OCR uses the configured image model with retries disabled", async () => {
    let request;
    let options;
    const usage = [];
    const provider = createOpenAiOcrProvider({
        apiKey: "never-sent-test-key",
        model: "configured-ocr-model",
        timeoutMs: 1000,
        client: {
            responses: {
                async create(nextRequest, nextOptions) {
                    request = nextRequest;
                    options = nextOptions;
                    return {
                        output_text: "Faithful handwritten transcription for OCR testing.",
                        usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 }
                    };
                }
            }
        },
        onUsage(entry) { usage.push(entry); }
    });
    const result = await provider.extractTextFromImage({
        buffer: PNG_FIXTURE,
        mimeType: "image/png",
        filename: "private-notes.png"
    });
    assert.match(result, /handwritten transcription/);
    assert.equal(request.model, "configured-ocr-model");
    assert.equal(options.maxRetries, 0);
    assert.equal(request.input[0].content[1].type, "input_image");
    assert.match(request.input[0].content[1].image_url, /^data:image\/png;base64,/);
    assert.match(OCR_TRANSCRIPTION_PROMPT, /Do not summarize/);
    assert.match(OCR_TRANSCRIPTION_PROMPT, /untrusted source content/);
    assert.deepEqual(usage[0], {
        provider: "openai",
        model: "configured-ocr-model",
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20
    });
    assert.doesNotMatch(JSON.stringify(usage), /never-sent-test-key|private-notes/);
});

test("OCR provider configuration remains disabled by default and maps safe errors", () => {
    assert.deepEqual(createConfiguredOcrProvider({ ocrEnabled: false }), {
        enabled: false,
        provider: "disabled"
    });
    assert.equal(normalizeOcrProviderError({ status: 429 }).code, "OCR_RATE_LIMITED");
    assert.equal(normalizeOcrProviderError(new Error("secret upstream detail")).code, "OCR_SERVICE_ERROR");
    assert.throws(() => createConfiguredOcrProvider({
        ocrEnabled: true,
        ocrProvider: "openai",
        openAiApiKey: null,
        openAiOcrModel: null
    }), error => error.code === "INVALID_OCR_CONFIG");
});
