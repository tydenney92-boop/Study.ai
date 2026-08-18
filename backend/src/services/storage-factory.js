const { createLocalFileStorage } = require("./local-file-storage");
const { createObjectFileStorage } = require("./object-file-storage");

function createConfiguredStorage(config) {
    if (config.storageDriver === "local") {
        return createLocalFileStorage({ uploadDirectory: config.uploadDirectory });
    }
    if (config.storageDriver === "s3") {
        return createObjectFileStorage({
            bucket: config.objectStorageBucket,
            region: config.objectStorageRegion,
            endpoint: config.objectStorageEndpoint,
            accessKeyId: config.objectStorageAccessKeyId,
            secretAccessKey: config.objectStorageSecretAccessKey,
            forcePathStyle: config.objectStorageForcePathStyle
        });
    }
    throw new Error(`Unsupported storage driver: ${config.storageDriver}`);
}

module.exports = { createConfiguredStorage };
