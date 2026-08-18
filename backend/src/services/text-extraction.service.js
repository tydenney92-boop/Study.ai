const { PDFParse } = require("pdf-parse");

function createTextExtractionService({ fileStorage, pdfParserFactory } = {}) {
    const createParser = pdfParserFactory || (options => new PDFParse(options));

    return {
        async extract({ storedFilename, materialType }) {
            if (materialType !== "pdf") {
                return "";
            }

            const pdfBuffer = await fileStorage.read(storedFilename);
            const parser = createParser({ data: pdfBuffer });

            try {
                const result = await parser.getText();
                return result.text;
            } finally {
                await parser.destroy();
            }
        }
    };
}

module.exports = {
    createTextExtractionService
};
