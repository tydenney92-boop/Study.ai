const { createApp } = require("../app");

const app = createApp();

console.log(
    "Database initialization complete. Versioned schema migrations begin in Stage 2."
);

app.locals.database.close();
