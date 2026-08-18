const { createApp } = require("./src/app");
const config = require("./src/config");

const app = createApp();

const server = app.listen(config.port, function() {
    console.log(
        `Study AI backend running at http://localhost:${config.port}`
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
