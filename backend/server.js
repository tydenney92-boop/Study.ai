const { createApp } = require("./src/app");
const config = require("./src/config");

const app = createApp();
const port = Number(process.env.PORT) || 3000;
const host = "0.0.0.0";

const server = app.listen(port, host, function() {
    const address = server.address();
    const listeningPort = typeof address === "object" && address
        ? address.port
        : port;
    console.log(
        `Study AI running on ${host}:${listeningPort} (${config.environment})`
    );
});

function shutdown() {
    server.close(function() {
        if (app.locals.sessionStore?.close) {
            app.locals.sessionStore.close();
        }
        if (app.locals.database) {
            app.locals.database.close();
        }

        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
