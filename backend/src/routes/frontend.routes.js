const express = require("express");
const path = require("path");

const FRONTEND_PAGES = [
    "index.html", "login.html", "signup.html", "course.html", "materials.html",
    "material.html", "study-guide.html", "quiz.html", "flashcards.html",
    "notes.html", "progress.html", "history.html"
];

function registerFrontendRoutes(app, { frontendDirectory }) {
    app.use("/css", express.static(path.join(frontendDirectory, "css"), {
        dotfiles: "deny", fallthrough: false, maxAge: "1h"
    }));
    app.use("/js", express.static(path.join(frontendDirectory, "js"), {
        dotfiles: "deny", fallthrough: false, maxAge: "1h"
    }));
    app.get("/", (req, res) => res.sendFile(path.join(frontendDirectory, "index.html")));
    for (const page of FRONTEND_PAGES) {
        app.get(`/${page}`, (req, res) => res.sendFile(path.join(frontendDirectory, page)));
    }
}

module.exports = { FRONTEND_PAGES, registerFrontendRoutes };
