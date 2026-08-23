function reciprocalRank(results, expectedChunkIds) {
    const expected = new Set(expectedChunkIds);
    const index = results.findIndex(result => expected.has(result.chunkId));
    return index === -1 ? 0 : 1 / (index + 1);
}

async function evaluateRetrieval({ cases, retrieve }) {
    const relevant = cases.filter(item => item.expectedChunkIds.length > 0);
    const irrelevant = cases.filter(item => item.expectedChunkIds.length === 0);
    let recallAt1 = 0;
    let recallAt3 = 0;
    let reciprocalRankTotal = 0;
    let irrelevantCorrect = 0;
    const details = [];

    for (const item of cases) {
        const results = await retrieve(item);
        const ids = results.map(result => result.chunkId);
        if (item.expectedChunkIds.length > 0) {
            const expected = new Set(item.expectedChunkIds);
            recallAt1 += ids.slice(0, 1).filter(id => expected.has(id)).length /
                expected.size;
            recallAt3 += new Set(ids.slice(0, 3).filter(id => expected.has(id))).size /
                expected.size;
            reciprocalRankTotal += reciprocalRank(results, item.expectedChunkIds);
        } else if (results.length === 0) {
            irrelevantCorrect++;
        }
        details.push({ name: item.name, resultChunkIds: ids });
    }

    return {
        cases: cases.length,
        recallAt1: relevant.length ? recallAt1 / relevant.length : 0,
        recallAt3: relevant.length ? recallAt3 / relevant.length : 0,
        meanReciprocalRank: relevant.length ? reciprocalRankTotal / relevant.length : 0,
        irrelevantAccuracy: irrelevant.length ? irrelevantCorrect / irrelevant.length : 1,
        details
    };
}

module.exports = { evaluateRetrieval, reciprocalRank };
