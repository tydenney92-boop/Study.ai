const { AppError } = require("../utils/app-error");

const RECENT_CONVERSATIONS_LIMIT = 5;
const DISPLAY_MESSAGE_LIMIT = 100;

function createAskNotesConversationService({
    coursesService,
    conversationsRepository,
    historyMaxTurns
}) {
    function requireConversation(conversationId, courseId, userId) {
        coursesService.requireOwned(courseId, userId);
        const conversation = conversationsRepository.findOwned(
            conversationId,
            courseId,
            userId
        );
        if (!conversation) {
            throw new AppError({
                code: "ASK_NOTES_CONVERSATION_NOT_FOUND",
                message: "Conversation not found in this course.",
                status: 404
            });
        }
        return conversation;
    }

    return {
        create(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return conversationsRepository.create(courseId, userId);
        },

        list(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return conversationsRepository.listOwned(
                courseId,
                userId,
                RECENT_CONVERSATIONS_LIMIT
            );
        },

        get(conversationId, courseId, userId) {
            const conversation = requireConversation(conversationId, courseId, userId);
            return {
                ...conversation,
                messages: conversationsRepository.messages(
                    conversationId,
                    DISPLAY_MESSAGE_LIMIT
                )
            };
        },

        context(conversationId, courseId, userId) {
            if (!conversationId) return [];
            requireConversation(conversationId, courseId, userId);
            return conversationsRepository.messages(
                conversationId,
                historyMaxTurns * 2 + 4
            );
        },

        appendTurn(input) {
            if (input.conversationId) {
                requireConversation(input.conversationId, input.courseId, input.userId);
            } else {
                coursesService.requireOwned(input.courseId, input.userId);
            }
            return conversationsRepository.appendTurn(input);
        }
    };
}

module.exports = {
    DISPLAY_MESSAGE_LIMIT,
    RECENT_CONVERSATIONS_LIMIT,
    createAskNotesConversationService
};
