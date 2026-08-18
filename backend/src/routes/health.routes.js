function registerHealthRoutes(app, { database, fileStorage, config }) {
    app.get("/health/live", function(req, res) {
        res.json({ status: "ok" });
    });

    app.get("/health/ready", async function(req, res) {
        try {
            database.prepare("SELECT 1 AS ready").get();
            await fileStorage.healthCheck();
            res.json({
                status: "ready",
                database: config.databaseDriver,
                storage: fileStorage.driver,
                ai: config.aiEnabled ? "configured" : "disabled"
            });
        } catch (error) {
            res.status(503).json({ status: "not_ready" });
        }
    });

    app.get("/api/test", function(req, res) {
        res.json({
            message: "Study AI backend is working!"
        });
    });
}

module.exports = {
    registerHealthRoutes
};
