const { AppError } = require("../utils/app-error");

function createOcrService({
    provider,
    usageGuard,
    maxImageBytes,
    maxPdfPages,
    maxTotalBytes,
    output = console
}) {
    function imageLimit(buffer) {
        if (buffer.length > maxImageBytes) {
            throw new AppError({
                code: "OCR_IMAGE_TOO_LARGE",
                message: "This image exceeds the text-recognition size limit.",
                status: 413
            });
        }
    }

    async function execute(userId, images) {
        if (!provider.enabled) {
            throw new AppError({
                code: "OCR_DISABLED",
                message: "Text recognition is not enabled for this deployment.",
                status: 503
            });
        }
        images.forEach(image => imageLimit(image.buffer));
        const totalBytes = images.reduce((total, image) => total + image.buffer.length, 0);
        if (totalBytes > maxTotalBytes) {
            throw new AppError({
                code: "OCR_TOTAL_TOO_LARGE",
                message: "This material exceeds the total text-recognition processing limit.",
                status: 413
            });
        }

        return usageGuard.execute(userId, async () => {
            const startedAt = Date.now();
            const pages = [];
            for (const image of images) {
                pages.push(await provider.extractTextFromImage(image));
            }
            output.log(JSON.stringify({
                level: "info",
                event: "ocr_completed",
                provider: provider.provider,
                pageCount: images.length,
                totalBytes,
                durationMs: Date.now() - startedAt
            }));
            return pages;
        });
    }

    return {
        enabled: Boolean(provider.enabled),
        provider: provider.provider,
        maxPdfPages,
        async extractImage({ userId, buffer, mimeType, filename }) {
            return (await execute(userId, [{ buffer, mimeType, filename }]))[0];
        },
        async extractPdfPages({ userId, pages, filename, totalPages }) {
            if (totalPages > maxPdfPages) {
                throw new AppError({
                    code: "OCR_PDF_PAGE_LIMIT",
                    message: `Scanned PDFs are limited to ${maxPdfPages} pages for text recognition.`,
                    status: 413
                });
            }
            if (pages.length > maxPdfPages) {
                throw new AppError({
                    code: "OCR_PDF_PAGE_LIMIT",
                    message: `Scanned PDFs are limited to ${maxPdfPages} pages for text recognition.`,
                    status: 413
                });
            }
            const results = await execute(userId, pages.map(page => ({
                buffer: Buffer.from(page.data),
                mimeType: "image/png",
                filename: `${filename} page ${page.pageNumber}`
            })));
            return results.map((text, index) => ({
                pageNumber: pages[index].pageNumber,
                text
            }));
        }
    };
}

module.exports = { createOcrService };
