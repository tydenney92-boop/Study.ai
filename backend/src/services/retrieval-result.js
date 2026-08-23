const RETRIEVAL_METADATA = Symbol("retrievalMetadata");

function attachRetrievalMetadata(results, metadata) {
    Object.defineProperty(results, RETRIEVAL_METADATA, {
        value: Object.freeze({ ...metadata }),
        enumerable: false,
        configurable: false
    });
    return results;
}

function retrievalMetadata(results) {
    return results?.[RETRIEVAL_METADATA] || {
        mode: "unknown",
        requestedMode: "unknown",
        fallbackOccurred: false
    };
}

module.exports = {
    attachRetrievalMetadata,
    retrievalMetadata,
    RETRIEVAL_METADATA
};
