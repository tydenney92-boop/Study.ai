const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createTextExtractionService,
    extractTxt,
    extractDocx,
    extractPptx
} = require("../src/services/text-extraction.service");
const { docxFixture, pptxFixture } = require("./helpers/office-fixtures");

test("PDF extraction retains parser lifecycle and reports extracted text", async () => {
    let destroyed = false;
    const service = createTextExtractionService({
        fileStorage: { async read() { return Buffer.from("pdf fixture"); } },
        pdfParserFactory({ data }) {
            assert.equal(data.toString(), "pdf fixture");
            return {
                async getText() {
                    return { text: "Existing PDF extraction text remains available." };
                },
                async destroy() { destroyed = true; }
            };
        }
    });

    const result = await service.extract({
        storedFilename: "fixture.pdf",
        originalFilename: "fixture.pdf",
        materialType: "pdf"
    });
    assert.equal(result.status, "extracted");
    assert.equal(result.text, "Existing PDF extraction text remains available.");
    assert.equal(destroyed, true);
});

test("image-only PDF extraction reports no usable text", async () => {
    const service = createTextExtractionService({
        fileStorage: { async read() { return Buffer.from("scanned pdf fixture"); } },
        pdfParserFactory() {
            return {
                async getText() { return { text: " \n " }; },
                async destroy() {}
            };
        }
    });

    const result = await service.extract({
        storedFilename: "scan.pdf",
        originalFilename: "scan.pdf",
        materialType: "pdf"
    });
    assert.equal(result.status, "no_text");
    assert.equal(result.text, " \n ");
});

test("TXT extraction handles UTF-8, empty, and binary-looking input", () => {
    const valid = extractTxt(Buffer.from("\uFEFFFirst line.\r\nSecond useful line of notes."));
    assert.equal(valid.status, "extracted");
    assert.equal(valid.text, "First line.\nSecond useful line of notes.");
    assert.equal(extractTxt(Buffer.from("  \n\n ")).status, "no_text");
    assert.throws(
        () => extractTxt(Buffer.from([0, 1, 2, 3, 4, 5])),
        error => error.code === "TEXT_FILE_BINARY" && error.status === 422
    );
});

test("DOCX extraction preserves readable paragraph separation", async () => {
    const result = await extractDocx(await docxFixture([
        "First paragraph of course notes.",
        "Second paragraph with more detail."
    ]));
    assert.equal(result.status, "extracted");
    assert.match(result.text, /First paragraph of course notes\.\n\nSecond paragraph/);
});

test("PPTX extraction preserves numeric slide order and rough separation", async () => {
    const result = await extractPptx(await pptxFixture([
        ["Opening concept", "Supporting detail"],
        ["Second slide conclusion"]
    ]));
    assert.equal(result.status, "extracted");
    assert.match(result.text, /^Slide 1\nOpening concept Supporting detail/);
    assert.match(result.text, /\n\nSlide 2\nSecond slide conclusion$/);
});

test("malformed DOCX and PPTX archives fail safely", async () => {
    for (const extractor of [extractDocx, extractPptx]) {
        await assert.rejects(
            () => extractor(Buffer.from("not a zip archive")),
            error => error.code === "OFFICE_ARCHIVE_INVALID" && error.status === 422
        );
    }
});
