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
                sources: context.materials.map(material => ({
                    materialId: material.id,
                    materialName: material.name
                })),
                generatedContent
            });
        }
    };
}

module.exports = {
    createStudyGuideService
};
