const express = require("express");
const path = require("path");

const FRONTEND_PAGES = [
    "index.html", "login.html", "signup.html", "course.html", "materials.html",
    "material.html", "study-guide.html", "quiz.html", "flashcards.html",
    "notes.html", "progress.html", "history.html", "recommendations.html", "planner.html"
];

function registerFrontendRoutes(app, { frontendDirectory }) {
    const staticOptions = {
        dotfiles: "deny",
        etag: true,
        fallthrough: false,
        lastModified: true,
        maxAge: 0,
        setHeaders(response) {
            response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        }
    };
    const sendPage = page => (req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path.join(frontendDirectory, page));
    };

    app.use("/css", express.static(path.join(frontendDirectory, "css"), staticOptions));
    app.use("/js", express.static(path.join(frontendDirectory, "js"), staticOptions));
    app.get("/", sendPage("index.html"));
    for (const page of FRONTEND_PAGES) {
        app.get(`/${page}`, sendPage(page));
    }
}

module.exports = { FRONTEND_PAGES, registerFrontendRoutes };
