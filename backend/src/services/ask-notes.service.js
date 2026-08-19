const { stringField } = require("../utils/validation");
const { callAi } = require("./ai-call");
const { buildAskNotesPrompt } = require("./ai-prompts");
const { parseJsonResponse, validateAskNotesAnswer } = require("./ai-response-validation");

function createAskNotesService({ aiClient, materialContextService }) {
    return {
        async ask({ courseId, userId, materialIds, question }) {
            const validatedQuestion = stringField(
                { question },
                "question",
                { maxLength: 1000 }
            );
            const context = materialContextService.resolve({
                courseId,
                userId,
                materialIds
            });
            const response = await callAi(
                aiClient,
                buildAskNotesPrompt(context.courseContent, validatedQuestion)
            );
            const answer = validateAskNotesAnswer(parseJsonResponse(response));

            return {
                answer,
                sources: context.materials.map(material => ({
                    materialId: material.id,
                    name: material.name
                }))
            };
        }
    };
}

module.exports = { createAskNotesService };
