function createFakeOcrProvider() {
    let count = 0;
    return {
        enabled: true,
        provider: "fake",
        get count() { return count; },
        async extractTextFromImage() {
            count++;
            return "The photographed course notes explain that supply and demand interact to determine market outcomes.";
        }
    };
}

module.exports = { createFakeOcrProvider };
