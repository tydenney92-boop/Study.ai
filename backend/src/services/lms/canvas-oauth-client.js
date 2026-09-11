const { AppError } = require("../../utils/app-error");
const { safeBase } = require("./canvas.provider");

const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

function createCanvasOAuthClient({
    baseUrl,
    clientId,
    clientSecret,
    redirectUri,
    fetchImpl = fetch,
    clock = () => Date.now()
}) {
    const origin = safeBase(baseUrl);
    const tokenUrl = new URL("/login/oauth2/token", origin);

    async function tokenRequest(parameters, errorCode, errorMessage) {
        let response;
        try {
            response = await fetchImpl(tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(parameters)
            });
        } catch (_error) {
            throw new AppError({ code: errorCode, message: errorMessage, status: 502 });
        }
        if (!response.ok) {
            throw new AppError({ code: errorCode, message: errorMessage, status: 401 });
        }
        let body;
        try {
            body = await response.json();
        } catch (_error) {
            throw new AppError({ code: errorCode, message: errorMessage, status: 502 });
        }
        if (!body || typeof body.access_token !== "string" || !body.access_token) {
            throw new AppError({ code: errorCode, message: errorMessage, status: 502 });
        }
        const lifetime = Number.isFinite(Number(body.expires_in)) && Number(body.expires_in) > 0
            ? Number(body.expires_in)
            : DEFAULT_TOKEN_LIFETIME_SECONDS;
        return {
            accessToken: body.access_token,
            refreshToken: typeof body.refresh_token === "string" && body.refresh_token
                ? body.refresh_token
                : null,
            tokenExpiresAt: new Date(clock() + lifetime * 1000).toISOString(),
            providerUserId: body.user?.id === undefined || body.user?.id === null
                ? null
                : String(body.user.id)
        };
    }

    return {
        exchangeCode(code) {
            return tokenRequest({
                grant_type: "authorization_code",
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code
            }, "LMS_OAUTH_FAILED", "Canvas authorization failed. Try connecting again.");
        },

        refresh(refreshToken) {
            return tokenRequest({
                grant_type: "refresh_token",
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken
            }, "LMS_AUTH_EXPIRED", "Canvas connection expired. Reconnect Canvas.");
        },

        async revoke(accessToken) {
            try {
                const response = await fetchImpl(tokenUrl, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                return response.ok;
            } catch (_error) {
                return false;
            }
        }
    };
}

module.exports = { createCanvasOAuthClient, DEFAULT_TOKEN_LIFETIME_SECONDS };
