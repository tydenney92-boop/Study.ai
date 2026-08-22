const { normalizeSourceText } = require("./source-text-normalization");

const DEFAULT_CHUNK_OPTIONS = Object.freeze({
    targetCharacters: 1800,
    maxCharacters: 2400,
    overlapCharacters: 200,
    minimumCharacters: 250
});

function splitAtWords(text, maximum) {
    const pieces = [];
    let remaining = text.trim();
    while (remaining.length > maximum) {
        let boundary = remaining.lastIndexOf(" ", maximum);
        if (boundary < Math.floor(maximum * 0.6)) boundary = maximum;
        pieces.push(remaining.slice(0, boundary).trim());
        remaining = remaining.slice(boundary).trim();
    }
    if (remaining) pieces.push(remaining);
    return pieces;
}

function sentenceUnits(block, maximum) {
    if (block.length <= maximum) return [block];
    const sentences = block.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)
        ?.map(sentence => sentence.trim()).filter(Boolean) || [];
    if (sentences.length <= 1) return splitAtWords(block, maximum);

    const units = [];
    let current = "";
    for (const sentence of sentences) {
        if (sentence.length > maximum) {
            if (current) units.push(current);
            units.push(...splitAtWords(sentence, maximum));
            current = "";
            continue;
        }
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (candidate.length > maximum && current) {
            units.push(current);
            current = sentence;
        } else {
            current = candidate;
        }
    }
    if (current) units.push(current);
    return units;
}

function trailingWholeUnit(text, maximum) {
    const paragraphs = text.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
    const candidates = paragraphs.flatMap(paragraph => sentenceUnits(paragraph, maximum));
    let overlap = "";
    for (let index = candidates.length - 1; index >= 0; index--) {
        const candidate = overlap ? `${candidates[index]} ${overlap}` : candidates[index];
        if (candidate.length > maximum) break;
        overlap = candidate;
    }
    return overlap;
}

function createDocumentChunker(options = {}) {
    const settings = { ...DEFAULT_CHUNK_OPTIONS, ...options };
    if (
        settings.minimumCharacters >= settings.targetCharacters ||
        settings.targetCharacters > settings.maxCharacters ||
        settings.overlapCharacters >= settings.targetCharacters
    ) {
        throw new Error("Invalid document chunking configuration.");
    }

    return {
        chunk(text) {
            const normalized = normalizeSourceText(text);
            if (!normalized) return [];

            const logicalUnits = normalized.split(/\n{2,}/)
                .map(block => block.trim())
                .filter(Boolean)
                .flatMap(block => sentenceUnits(block, settings.maxCharacters));
            const groups = [];
            let current = "";

            for (const unit of logicalUnits) {
                const candidate = current ? `${current}\n\n${unit}` : unit;
                if (current && candidate.length > settings.targetCharacters) {
                    groups.push(current);
                    current = unit;
                } else {
                    current = candidate;
                }
            }
            if (current) groups.push(current);

            if (groups.length > 1 && groups.at(-1).length < settings.minimumCharacters) {
                const merged = `${groups.at(-2)}\n\n${groups.at(-1)}`;
                if (merged.length <= settings.maxCharacters) {
                    groups.splice(groups.length - 2, 2, merged);
                }
            }

            return groups.map((group, chunkIndex) => {
                let chunkText = group;
                if (chunkIndex > 0) {
                    const overlap = trailingWholeUnit(
                        groups[chunkIndex - 1],
                        settings.overlapCharacters
                    );
                    if (overlap && overlap.length + 2 + group.length <= settings.maxCharacters) {
                        chunkText = `${overlap}\n\n${group}`;
                    }
                }
                return {
                    chunkIndex,
                    text: chunkText,
                    characterCount: chunkText.length,
                    tokenEstimate: Math.max(1, Math.ceil(chunkText.length / 4))
                };
            });
        }
    };
}

module.exports = {
    DEFAULT_CHUNK_OPTIONS,
    createDocumentChunker,
    sentenceUnits
};
