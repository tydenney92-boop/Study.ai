const path = require("path");
const mammoth = require("mammoth");
const JSZip = require("jszip");
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { PDFParse } = require("pdf-parse");
const { AppError } = require("../utils/app-error");

const MAX_ARCHIVE_ENTRIES = 1000;
const MAX_ARCHIVE_EXPANDED_BYTES = 50 * 1024 * 1024;
const MIN_USABLE_TEXT_CHARACTERS = 20;

function normalizeText(text) {
    return String(text || "")
        .replace(/^\uFEFF/, "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map(line => line.replace(/[ \t]+$/g, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function extractionResult(text, { preserveText = false } = {}) {
    const normalized = normalizeText(text);
    const usefulCharacters = normalized.replace(/\s/g, "").length;
    const extracted = usefulCharacters >= MIN_USABLE_TEXT_CHARACTERS;
    return {
        text: preserveText ? String(text || "") : normalized,
        status: extracted ? "extracted" : "no_text",
        error: extracted
            ? null
            : "This material does not contain enough extractable text."
    };
}

function extractTxt(buffer) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    const binaryControls = [...sample].filter(byte =>
        byte === 0 || (byte < 32 && ![9, 10, 13].includes(byte))
    ).length;

    if (sample.length > 0 && binaryControls / sample.length > 0.01) {
        throw new AppError({
            code: "TEXT_FILE_BINARY",
            message: "The TXT file appears to contain binary data.",
            status: 422
        });
    }

    let text;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
        throw new AppError({
            code: "TEXT_ENCODING_UNSUPPORTED",
            message: "The TXT file must use UTF-8 text encoding.",
            status: 422
        });
    }
    return extractionResult(text);
}

async function loadSafeArchive(buffer) {
    let archive;
    try {
        archive = await JSZip.loadAsync(buffer, {
            checkCRC32: false,
            createFolders: false
        });
    } catch (error) {
        throw new AppError({
            code: "OFFICE_ARCHIVE_INVALID",
            message: "The Office file is malformed or unreadable.",
            status: 422
        });
    }

    const entries = Object.values(archive.files);
    if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new AppError({
            code: "OFFICE_ARCHIVE_TOO_LARGE",
            message: "The Office file contains too many archive entries.",
            status: 413
        });
    }

    const expandedBytes = entries.reduce((total, entry) =>
        total + Number(entry?._data?.uncompressedSize || 0), 0);
    if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
        throw new AppError({
            code: "OFFICE_ARCHIVE_TOO_LARGE",
            message: "The expanded Office file exceeds the safety limit.",
            status: 413
        });
    }

    return archive;
}

async function extractDocx(buffer) {
    await loadSafeArchive(buffer);
    try {
        const result = await mammoth.extractRawText({ buffer });
        return extractionResult(result.value);
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError({
            code: "DOCX_EXTRACTION_FAILED",
            message: "Text could not be extracted from this DOCX file.",
            status: 422
        });
    }
}

function collectXmlText(node, output) {
    if (Array.isArray(node)) {
        node.forEach(value => collectXmlText(value, output));
        return;
    }
    if (!node || typeof node !== "object") return;

    for (const [key, value] of Object.entries(node)) {
        if (key === "t") {
            const values = Array.isArray(value) ? value : [value];
            values.forEach(item => {
                if (typeof item === "string") output.push(item);
                else collectXmlText(item, output);
            });
        } else if (key === "#text" && typeof value === "string") {
            output.push(value);
        } else {
            collectXmlText(value, output);
        }
    }
}

async function extractPptx(buffer) {
    const archive = await loadSafeArchive(buffer);
    const slides = Object.keys(archive.files)
        .map(name => ({ name, match: /^ppt\/slides\/slide(\d+)\.xml$/i.exec(name) }))
        .filter(entry => entry.match && !archive.files[entry.name].dir)
        .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
    const parser = new XMLParser({
        ignoreAttributes: true,
        removeNSPrefix: true,
        preserveOrder: true,
        trimValues: false
    });
    const sections = [];

    try {
        for (const slide of slides) {
            const xml = await archive.files[slide.name].async("string");
            if (XMLValidator.validate(xml) !== true) {
                throw new Error("Invalid slide XML");
            }
            const text = [];
            collectXmlText(parser.parse(xml), text);
            const normalized = normalizeText(text.join(" "));
            if (normalized) {
                sections.push(`Slide ${Number(slide.match[1])}\n${normalized}`);
            }
        }
    } catch (error) {
        throw new AppError({
            code: "PPTX_EXTRACTION_FAILED",
            message: "Text could not be extracted from this PPTX file.",
            status: 422
        });
    }

    return extractionResult(sections.join("\n\n"));
}

function createTextExtractionService({ fileStorage, pdfParserFactory } = {}) {
    const createParser = pdfParserFactory || (options => new PDFParse(options));

    return {
        async extract({ storedFilename, originalFilename, materialType }) {
            const buffer = await fileStorage.read(storedFilename);
            const extension = path.extname(originalFilename || storedFilename).toLowerCase();

            if (materialType === "pdf") {
                const parser = createParser({ data: buffer });
                try {
                    const result = await parser.getText();
                    return extractionResult(result.text, { preserveText: true });
                } finally {
                    await parser.destroy();
                }
            }
            if (extension === ".txt") return extractTxt(buffer);
            if (extension === ".docx") return extractDocx(buffer);
            if (extension === ".pptx") return extractPptx(buffer);

            return {
                text: "",
                status: "unsupported",
                error: "This file format is not supported for text extraction."
            };
        }
    };
}

module.exports = {
    MAX_ARCHIVE_ENTRIES,
    MAX_ARCHIVE_EXPANDED_BYTES,
    MIN_USABLE_TEXT_CHARACTERS,
    createTextExtractionService,
    extractTxt,
    extractDocx,
    extractPptx,
    normalizeText
};
