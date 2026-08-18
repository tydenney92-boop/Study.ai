(function() {
    const loginUrl = `login.html?returnTo=${encodeURIComponent(
        window.location.pathname.split("/").pop() + window.location.search
    )}`;

    function redirectToLogin() {
        window.location.replace(loginUrl);
    }

    window.addEventListener("studyai:unauthenticated", redirectToLogin);

    async function loadCurrentUser() {
        try {
            const response = await StudyAI.api.get("/api/auth/me");
            document.querySelectorAll(".profile-card strong").forEach(element => {
                element.textContent = response.user.name;
            });
            document.querySelectorAll(".profile-avatar").forEach(element => {
                element.textContent = response.user.name.charAt(0).toUpperCase();
            });
            return response.user;
        } catch (error) {
            if (error.status !== 401) throw error;
            return null;
        }
    }

    async function logout() {
        try {
            await StudyAI.api.post("/api/auth/logout", {});
        } finally {
            window.location.replace("login.html");
        }
    }

    const sidebarBottom = document.querySelector(".sidebar-bottom");
    if (sidebarBottom) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "logout-button";
        button.textContent = "Log out";
        button.addEventListener("click", logout);
        sidebarBottom.appendChild(button);
    }

    window.StudyAI.auth = { loadCurrentUser, logout };
    loadCurrentUser();
})();
