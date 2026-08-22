const { callAi } = require("./ai-call");
const { buildStudyGuidePrompt } = require("./ai-prompts");
const { validateStudyGuide } = require("./ai-response-validation");

function createStudyGuideService({
    aiClient,
    materialContextService,
    studyGuidesRepository,
    maxAttempts = 2
}) {
    return {
        async generate({ courseId, userId, materialIds }) {
            const context = materialContextService.resolve({
                courseId,
                userId,
                materialIds
            });
            let generatedContent;
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const escalated = attempt === maxAttempts && attempt > 1;
                try {
                    const response = await callAi(
                        aiClient,
                        buildStudyGuidePrompt(context.courseContent),
                        {
                            workflow: "study_guide_generation",
                            tier: escalated ? "advanced" : "standard",
                            escalated
                        }
                    );
                    generatedContent = validateStudyGuide(response);
                    break;
                } catch (error) {
                    if (error.code !== "AI_OUTPUT_INVALID") throw error;
                    lastError = error;
                }
            }

            if (!generatedContent) throw lastError;

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
