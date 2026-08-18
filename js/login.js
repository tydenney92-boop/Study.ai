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
        const safeReturn = requested && !requested.includes(":") && !requested.startsWith("//")
            ? requested
            : "index.html";
        window.location.replace(safeReturn);
    } catch (error) {
        loginError.textContent = error.message;
        button.disabled = false;
    }
});
