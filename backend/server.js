const { createApp } = require("./src/app");
const config = require("./src/config");

const app = createApp();

const server = app.listen(config.port, config.host, function() {
    console.log(
        `Study AI running on ${config.host}:${config.port} (${config.environment})`
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
