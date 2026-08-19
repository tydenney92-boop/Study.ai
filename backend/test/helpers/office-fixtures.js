const JSZip = require("jszip");

async function docxFixture(paragraphs) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>${paragraphs.map(value =>
                `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`
            ).join("")}</w:body>
        </w:document>`);
    return zip.generateAsync({ type: "nodebuffer" });
}

async function pptxFixture(slides) {
    const zip = new JSZip();
    slides.forEach((values, index) => {
        zip.file(`ppt/slides/slide${index + 1}.xml`, `<?xml version="1.0"?>
            <p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
                ${values.map(value => `<p:sp><p:txBody><a:p><a:r><a:t>${value}</a:t></a:r></a:p></p:txBody></p:sp>`).join("")}
            </p:spTree></p:cSld></p:sld>`);
    });
    return zip.generateAsync({ type: "nodebuffer" });
}

module.exports = { docxFixture, pptxFixture };
