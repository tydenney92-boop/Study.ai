const { stringField } = require("../utils/validation");
const { callAi } = require("./ai-call");
const { buildAskNotesPrompt } = require("./ai-prompts");
const { parseJsonResponse, validateAskNotesAnswer } = require("./ai-response-validation");

const STANDARD_CONTEXT_CHARACTERS = 30000;
const STANDARD_MATERIAL_COUNT = 3;
const SYNTHESIS_PATTERN = /\b(compare|comparison|contrast|relationship|relate|cause|causes|caused|implication|implications|analy[sz]e|analysis|synthesize|synthesis|evaluate|interact|connection|connections|trade-?offs?)\b/i;

function selectAskNotesTier({ question, materialCount, contextLength }) {
    const multiPart = (question.match(/\?/g) || []).length > 1 ||
        /\b(and|versus|vs\.?|while)\b.+\b(how|why|what|which)\b/i.test(question);
    return materialCount >= STANDARD_MATERIAL_COUNT ||
        contextLength > STANDARD_CONTEXT_CHARACTERS ||
        SYNTHESIS_PATTERN.test(question) ||
        multiPart
        ? "standard"
        : "fast";
}

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
            const tier = selectAskNotesTier({
                question: validatedQuestion,
                materialCount: context.materials.length,
                contextLength: context.courseContent.length
            });
            const response = await callAi(
                aiClient,
                buildAskNotesPrompt(context.courseContent, validatedQuestion),
                {
                    workflow: "ask_notes",
                    tier,
                    escalated: tier !== "fast"
                }
            );
            const result = validateAskNotesAnswer(parseJsonResponse(response));

            return {
                answer: result.supportType === "not_found"
                    ? "The selected materials do not contain enough information to answer that question safely."
                    : result.answer,
                supportType: result.supportType,
                sources: context.materials.map(material => ({
                    materialId: material.id,
                    name: material.name
                }))
            };
        }
    };
}

module.exports = {
    STANDARD_CONTEXT_CHARACTERS,
    STANDARD_MATERIAL_COUNT,
    createAskNotesService,
    selectAskNotesTier
};
