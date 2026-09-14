function createFakeOcrProvider() {
    let count = 0;
    return {
        enabled: true,
        provider: "fake",
        get count() { return count; },
        async extractTextFromImage(image) {
            count++;
            if (/long-schedule/i.test(image.filename || "")) {
                return Array.from({ length: 16 }, (_, index) => `Homework ${index + 1} — September ${index + 1}`).join("\n");
            }
            if (/schedule/i.test(image.filename || "")) {
                return "Homework 1\nDue September 12 at 11:59 PM\nQuiz 1 — September 19\nMidterm 1 — October 10 at 19:00\nFinal paper due during finals week.";
            }
            return "The photographed course notes explain that supply and demand interact to determine market outcomes.";
        }
    };
}

module.exports = { createFakeOcrProvider };
