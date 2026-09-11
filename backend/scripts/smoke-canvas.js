const config = require("../src/config");
const { createApp } = require("../src/app");

function positiveEnvironment(name) {
    const value = Number(process.env[name]);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}

async function run() {
    if (process.env.RUN_CANVAS_SMOKE !== "1") {
        throw new Error("Canvas smoke mode is disabled. Set RUN_CANVAS_SMOKE=1 explicitly.");
    }
    const userId = positiveEnvironment("CANVAS_SMOKE_USER_ID");
    const connectionId = positiveEnvironment("CANVAS_SMOKE_CONNECTION_ID");
    const app = createApp({ config });
    try {
        const summary = await app.locals.lmsService.smoke(connectionId, userId);
        console.log(JSON.stringify({ event: "canvas_smoke_complete", ...summary }));
    } finally {
        app.locals.sessionStore?.close?.();
        app.locals.database?.close?.();
    }
}

run().catch(error => {
    console.error(JSON.stringify({
        event: "canvas_smoke_failed",
        code: error.code || "CANVAS_SMOKE_FAILED",
        message: error.message
    }));
    process.exitCode = 1;
});
