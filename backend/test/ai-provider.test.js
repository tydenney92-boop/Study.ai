const test = require("node:test");
const assert = require("node:assert/strict");
const { createConfiguredAiClient } = require("../src/services/ai-client-factory");
const { createOpenAiClient } = require("../src/services/openai-client");
const { createOllamaClient } = require("../src/services/ollama-client");
const { createAiUsageGuard } = require("../src/services/ai-usage-guard");

test("configured factory retains Ollama and supports OpenAI", () => {
    const ollama = createConfiguredAiClient({
        aiEnabled: true,
        aiProvider: "ollama",
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "local-test-model",
        aiTimeoutMs: 100
    });
    const openai = createConfiguredAiClient({
        aiEnabled: true,
        aiProvider: "openai",
        openAiApiKey: "test-key-never-sent",
        openAiModels: {
            fast: "fast-test-model",
            standard: "standard-test-model",
            advanced: "advanced-test-model"
        },
        aiTimeoutMs: 100
    });

    assert.equal(typeof ollama.generate, "function");
    assert.equal(typeof openai.generate, "function");
});

test("OpenAI client returns output and explicitly disables automatic retries", async () => {
    let capturedRequest;
    let capturedOptions;
    const client = createOpenAiClient({
        model: "configured-test-model",
        timeoutMs: 1000,
        client: {
            responses: {
                async create(request, options) {
                    capturedRequest = request;
                    capturedOptions = options;
                    return { output_text: "generated text" };
                }
            }
        }
    });

    assert.equal(await client.generate("private prompt"), "generated text");
    assert.deepEqual(capturedRequest, {
        model: "configured-test-model",
        input: "private prompt"
    });
    assert.equal(capturedOptions.maxRetries, 0);
    assert.ok(capturedOptions.signal instanceof AbortSignal);
});

test("OpenAI client maps generic tiers to configured model names", async () => {
    const models = [];
    const client = createOpenAiClient({
        models: {
            fast: "gpt-fast-test",
            standard: "gpt-standard-test",
            advanced: "gpt-advanced-test"
        },
        timeoutMs: 1000,
        client: {
            responses: {
                async create(request) {
                    models.push(request.model);
                    return { output_text: "generated text" };
                }
            }
        }
    });

    await client.generate("one", { tier: "fast" });
    await client.generate("two", { tier: "standard" });
    await client.generate("three", { tier: "advanced" });
    assert.deepEqual(models, [
        "gpt-fast-test",
        "gpt-standard-test",
        "gpt-advanced-test"
    ]);
});

test("OpenAI legacy model safely supplies every tier", async () => {
    const models = [];
    const client = createOpenAiClient({
        model: "legacy-model",
        timeoutMs: 1000,
        client: {
            responses: {
                async create(request) {
                    models.push(request.model);
                    return { output_text: "generated text" };
                }
            }
        }
    });

    await client.generate("one", { tier: "fast" });
    await client.generate("two", { tier: "advanced" });
    assert.deepEqual(models, ["legacy-model", "legacy-model"]);
});

test("Ollama accepts generic tier metadata while retaining its configured model", async t => {
    const originalFetch = global.fetch;
    let requestBody;
    global.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            async json() { return { response: "local response" }; }
        };
    };
    t.after(() => { global.fetch = originalFetch; });
    const client = createOllamaClient({
        baseUrl: "http://localhost:11434",
        model: "local-test-model",
        timeoutMs: 1000
    });

    assert.equal(
        await client.generate("prompt", { tier: "advanced", workflow: "quiz_generation" }),
        "local response"
    );
    assert.equal(requestBody.model, "local-test-model");
    assert.equal(requestBody.prompt, "prompt");
});

for (const scenario of [
    { error: { name: "AbortError" }, code: "AI_TIMEOUT", status: 504 },
    { error: { status: 429 }, code: "AI_RATE_LIMITED", status: 503 },
    { error: { status: 500 }, code: "AI_SERVICE_ERROR", status: 502 }
]) {
    test(`OpenAI errors normalize to ${scenario.code}`, async () => {
        const client = createOpenAiClient({
            model: "configured-test-model",
            timeoutMs: 1000,
            client: {
                responses: {
                    async create() {
                        throw scenario.error;
                    }
                }
            }
        });

        await assert.rejects(
            () => client.generate("prompt"),
            error => error.code === scenario.code && error.status === scenario.status
        );
    });
}

test("AI rate limits are tracked independently by authenticated user id", async () => {
    let timestamp = 1000;
    const guard = createAiUsageGuard({
        windowMs: 10000,
        maxRequests: 1,
        maxConcurrentRequests: 2,
        now: () => timestamp
    });

    assert.equal(await guard.execute(1, async () => "one"), "one");
    await assert.rejects(
        () => guard.execute(1, async () => "blocked"),
        error => error.code === "AI_RATE_LIMIT_EXCEEDED" && error.status === 429
    );
    assert.equal(await guard.execute(2, async () => "two"), "two");

    timestamp += 10000;
    assert.equal(await guard.execute(1, async () => "reset"), "reset");
});

test("AI concurrency permit covers an entire operation", async () => {
    const guard = createAiUsageGuard({
        windowMs: 10000,
        maxRequests: 10,
        maxConcurrentRequests: 1
    });
    let release;
    const pending = guard.execute(1, () => new Promise(resolve => {
        release = resolve;
    }));

    await assert.rejects(
        () => guard.execute(2, async () => "blocked"),
        error => error.code === "AI_CONCURRENCY_LIMIT_EXCEEDED" && error.status === 503
    );

    release("done");
    assert.equal(await pending, "done");
    assert.equal(await guard.execute(2, async () => "available"), "available");
});
