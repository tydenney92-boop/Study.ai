const { callAi } = require("./ai-call");
const { buildStudyGuidePrompt } = require("./ai-prompts");
const { validateStudyGuide } = require("./ai-response-validation");

function createStudyGuideService({
    aiClient,
    materialContextService,
    studyGuidesRepository
}) {
    return {
        async generate({ courseId, userId, materialIds }) {
            const context = materialContextService.resolve({
                courseId,
                userId,
                materialIds
            });
            const response = await callAi(
                aiClient,
                buildStudyGuidePrompt(context.courseContent)
            );
            const generatedContent = validateStudyGuide(response);

            return studyGuidesRepository.createWithMaterials({
                userId,
                courseId,
                materialIds: context.materialIds,
                generatedContent
            });
        }
    };
}

module.exports = {
    createStudyGuideService
};
