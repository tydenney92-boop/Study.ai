const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#auth-error");

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector("button[type='submit']");
    button.disabled = true;
    loginError.textContent = "";

    try {
        await StudyAI.api.post("/api/auth/login", {
            email: document.querySelector("#email").value,
            password: document.querySelector("#password").value
        });
        const requested = new URLSearchParams(window.location.search).get("returnTo");
        const allowedPages = new Set([
            "index.html", "course.html", "materials.html", "material.html",
            "study-guide.html", "quiz.html", "flashcards.html", "notes.html",
            "progress.html", "history.html"
        ]);
        const parsedReturn = requested ? new URL(requested, window.location.href) : null;
        const page = parsedReturn?.pathname.split("/").pop();
        const safeReturn = parsedReturn && parsedReturn.origin === window.location.origin && allowedPages.has(page)
            ? `${page}${parsedReturn.search}${parsedReturn.hash}`
            : "index.html";
        window.location.replace(safeReturn);
    } catch (error) {
        loginError.textContent = error.message;
        button.disabled = false;
    }
});
