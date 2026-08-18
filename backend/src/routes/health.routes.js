function registerHealthRoutes(app) {
    app.get("/api/test", function(req, res) {
        res.json({
            message: "Study AI backend is working!"
        });
    });
}

module.exports = {
    registerHealthRoutes
};
