function createOllamaClient({ baseUrl, model }) {
    return {
        async generate(prompt) {
            const response = await fetch(
                `${baseUrl}/api/generate`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model,
                        prompt,
                        stream: false
                    })
                }
            );

            if (!response.ok) {
                throw new Error("Ollama request failed.");
            }

            const data = await response.json();
            return data.response;
        }
    };
}

module.exports = {
    createOllamaClient
};
