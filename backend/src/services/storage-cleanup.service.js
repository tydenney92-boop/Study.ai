function createStorageCleanupService({ repository, fileStorage }) {
    async function reconcileJobs(jobs) {
        let completed = 0;
        for (const job of jobs) {
            try {
                await fileStorage.remove(job.storedFilename);
                repository.complete(job.id, job.userId);
                completed++;
            } catch (error) {
                repository.fail(job.id, job.userId, error);
            }
        }
        return { completed, pending: jobs.length - completed };
    }

    return {
        reconcileJobs,
        reconcileUser(userId) {
            return reconcileJobs(repository.listPending(userId));
        }
    };
}

module.exports = { createStorageCleanupService };
