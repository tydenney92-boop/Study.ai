(function() {
    const FOCUSABLE = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    function notify(message, { type = "info", duration = 5000 } = {}) {
        let region = document.querySelector("#app-notification-region");
        if (!region) {
            region = document.createElement("div");
            region.id = "app-notification-region";
            region.className = "app-notification-region";
            region.setAttribute("aria-live", "polite");
            region.setAttribute("aria-atomic", "true");
            document.body.appendChild(region);
        }

        const notice = document.createElement("div");
        notice.className = `app-notification ${type}`;
        notice.setAttribute("role", type === "error" ? "alert" : "status");
        const text = document.createElement("span");
        text.textContent = message;
        const close = document.createElement("button");
        close.type = "button";
        close.setAttribute("aria-label", "Dismiss notification");
        close.textContent = "×";
        close.addEventListener("click", () => notice.remove());
        notice.append(text, close);
        region.appendChild(notice);
        if (duration > 0) window.setTimeout(() => notice.remove(), duration);
        return notice;
    }

    function setupModal(overlay) {
        if (!overlay || overlay.dataset.accessibleModal === "true") return;
        overlay.dataset.accessibleModal = "true";
        const dialog = overlay.querySelector("[role='dialog']");
        if (!dialog) return;
        dialog.tabIndex = -1;
        let opener = null;
        const openClass = overlay.classList.contains("upload-modal-overlay")
            ? "active"
            : "open";
        const isOpen = () => overlay.classList.contains(openClass);
        let wasOpen = isOpen();

        function close() {
            if (!isOpen()) return;
            overlay.classList.remove(openClass);
            overlay.setAttribute("aria-hidden", "true");
            overlay.dispatchEvent(new CustomEvent("studyai:modal-close"));
        }

        overlay.setAttribute("aria-hidden", isOpen() ? "false" : "true");
        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });
        overlay.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
                .filter(element => !element.hidden);
            if (!focusable.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        new MutationObserver(() => {
            if (isOpen()) {
                if (!wasOpen) opener = document.activeElement;
                overlay.setAttribute("aria-hidden", "false");
                window.requestAnimationFrame(() => {
                    (dialog.querySelector(FOCUSABLE) || dialog).focus();
                });
            } else {
                overlay.setAttribute("aria-hidden", "true");
                if (wasOpen) opener?.focus?.();
            }
            wasOpen = isOpen();
        }).observe(overlay, { attributes: true, attributeFilter: ["class"] });
    }

    document.querySelectorAll(".app-modal-overlay, .upload-modal-overlay")
        .forEach(setupModal);

    window.StudyAI.ui = { notify, setupModal };
})();
