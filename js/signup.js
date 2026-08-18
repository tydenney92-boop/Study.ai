const signupForm = document.querySelector("#signup-form");
const signupError = document.querySelector("#auth-error");

signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.querySelector("#password").value;
    const confirmation = document.querySelector("#password-confirmation").value;
    if (password !== confirmation) {
        signupError.textContent = "Passwords do not match.";
        return;
    }

    const button = signupForm.querySelector("button[type='submit']");
    button.disabled = true;
    signupError.textContent = "";
    try {
        await StudyAI.api.post("/api/auth/register", {
            name: document.querySelector("#name").value,
            email: document.querySelector("#email").value,
            password
        });
        window.location.replace("index.html");
    } catch (error) {
        signupError.textContent = error.message;
        button.disabled = false;
    }
});
