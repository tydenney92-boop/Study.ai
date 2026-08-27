const FOLLOW_UP_PATTERN = /^(?:\s*)(?:why\??|how so\??|what about\b|and\b)|\b(?:that|those|this concept|it|them|the first one|the second one|again|another example|differently|more simply|step by step)\b/i;

function boundedStudentTurns(messages, { maxTurns, maxCharacters }) {
    const studentMessages = messages.filter(message => message.role === "user");
    const selected = [];
    let characters = 0;
    for (let index = studentMessages.length - 1; index >= 0; index--) {
        const content = studentMessages[index].content.trim();
        if (!content) continue;
        if (selected.length >= maxTurns) break;
        const remaining = maxCharacters - characters;
        if (remaining <= 0) break;
        const bounded = content.slice(0, remaining);
        selected.push(bounded);
        characters += bounded.length;
        if (bounded.length < content.length) break;
    }
    return selected.reverse();
}

function createAskNotesFollowUpService({ maxTurns, maxCharacters }) {
    return {
        resolve(question, messages) {
            const turns = boundedStudentTurns(messages, { maxTurns, maxCharacters });
            const isFollowUp = FOLLOW_UP_PATTERN.test(question) && turns.length > 0;
            if (!isFollowUp) {
                return { isFollowUp: false, retrievalQuery: question, intentContext: [] };
            }
            const topicAnchor = [...turns].reverse().find(turn =>
                !FOLLOW_UP_PATTERN.test(turn)
            );
            const recentTurn = turns.at(-1);
            const anchors = [...new Set([topicAnchor, recentTurn].filter(Boolean))];
            const prefix = `${question}\nPrior student topic: `;
            const remaining = Math.max(0, 1000 - prefix.length);
            const anchorText = anchors.join(" | ").slice(0, remaining);
            return {
                isFollowUp: true,
                retrievalQuery: `${prefix}${anchorText}`.slice(0, 1000),
                intentContext: turns
            };
        },

        boundedStudentTurns(messages) {
            return boundedStudentTurns(messages, { maxTurns, maxCharacters });
        }
    };
}

module.exports = {
    FOLLOW_UP_PATTERN,
    boundedStudentTurns,
    createAskNotesFollowUpService
};
