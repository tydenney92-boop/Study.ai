const { createApp } = require("../app");

const app = createApp();

if (app.locals.migrations.applied.length === 0) {
    console.log("Database is already up to date.");
} else {
    console.log(
        `Applied migrations: ${app.locals.migrations.applied.join(", ")}`
    );

    if (app.locals.migrations.backupPath) {
        console.log(`Verified backup: ${app.locals.migrations.backupPath}`);
    }
}

app.locals.database.close();
