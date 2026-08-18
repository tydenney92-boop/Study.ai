const test = require("node:test");
const assert = require("node:assert/strict");
const { createObjectFileStorage } = require("../src/services/object-file-storage");

test("S3-compatible storage persists, reads, checks, and removes opaque objects", async () => {
    const calls = [];
    const client = {
        async send(command) {
            calls.push(command.constructor.name);
            if (command.constructor.name === "GetObjectCommand") {
                return {
                    Body: {
                        async transformToByteArray() {
                            return new TextEncoder().encode("stored text");
                        }
                    }
                };
            }
            return {};
        }
    };
    const storage = createObjectFileStorage({
        bucket: "test-bucket",
        region: "auto",
        client
    });
    const key = await storage.persist({
        originalname: "lecture.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("pdf")
    });
    assert.match(key, /^[0-9a-f-]+\.pdf$/);
    assert.equal((await storage.read(key)).toString(), "stored text");
    await storage.healthCheck();
    await storage.remove(key);
    assert.deepEqual(calls, [
        "PutObjectCommand", "GetObjectCommand", "HeadBucketCommand", "DeleteObjectCommand"
    ]);
});
