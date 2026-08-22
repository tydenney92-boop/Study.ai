(function() {
    class ApiError extends Error {
        constructor(message, options) {
            super(message);
            this.name = "ApiError";
            this.status = options.status;
            this.code = options.code;
            this.details = options.details;
        }
    }

    async function request(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            options.timeoutMs || 30000
        );
        const headers = { ...(options.headers || {}) };
        let body = options.body;

        if (
            body !== undefined &&
            body !== null &&
            !(body instanceof FormData) &&
            typeof body !== "string"
        ) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
        }

        try {
            const response = await fetch(StudyAI.apiUrl(path), {
                method: options.method || "GET",
                headers,
                body,
                credentials: "include",
                signal: controller.signal
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                const errorPayload = payload && payload.error;
                const message = typeof errorPayload === "string"
                    ? errorPayload
                    : errorPayload?.message || "The request could not be completed.";
                const apiError = new ApiError(message, {
                    status: response.status,
                    code: errorPayload?.code,
                    details: errorPayload?.details
                });
                if (response.status === 401) {
                    window.dispatchEvent(new CustomEvent("studyai:unauthenticated", {
                        detail: apiError
                    }));
                }
                throw apiError;
            }

            return payload;
        } catch (error) {
            if (error.name === "AbortError") {
                throw new ApiError("The request took too long. Please try again.", {
                    status: 0,
                    code: "REQUEST_TIMEOUT"
                });
            }

            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    window.StudyAI.api = {
        request,
        get(path, options) {
            return request(path, options);
        },
        post(path, body, options = {}) {
            return request(path, { ...options, method: "POST", body });
        },
        put(path, body, options = {}) {
            return request(path, { ...options, method: "PUT", body });
        },
        patch(path, body, options = {}) {
            return request(path, { ...options, method: "PATCH", body });
        },
        delete(path, options = {}) {
            return request(path, { ...options, method: "DELETE" });
        },
        upload(path, formData, options = {}) {
            return request(path, { ...options, method: "POST", body: formData });
        },
        ApiError
    };
})();
