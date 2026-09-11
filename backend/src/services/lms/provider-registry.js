const { createCanvasProvider } = require("./canvas.provider");

function createProviderRegistry(options = {}) {
    return {
        create(connection, accessToken, providerOptions = {}) {
            if (options.factory) return options.factory(connection, accessToken, providerOptions);
            if (connection.provider === "canvas") {
                return createCanvasProvider({
                    baseUrl: connection.baseUrl,
                    accessToken,
                    refreshAccessToken: providerOptions.refreshAccessToken,
                    fetchImpl: options.fetchImpl
                });
            }
            throw new Error(`Unsupported LMS provider: ${connection.provider}`);
        }
    };
}

module.exports = { createProviderRegistry };
