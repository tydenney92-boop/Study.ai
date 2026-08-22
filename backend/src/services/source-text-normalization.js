function normalizeSourceText(value) {
    const pages = String(value || "").replace(/\r\n?/g, "\n").split("\f");
    if (pages.length > 1) {
        const edges = pages.map(page =>
            page.split("\n").map(line => line.trim()).filter(Boolean)
        );
        const counts = new Map();
        edges.forEach(lines => [lines[0], lines.at(-1)].filter(Boolean).forEach(line => {
            if (line.length <= 120) counts.set(line, (counts.get(line) || 0) + 1);
        }));
        const boilerplate = new Set(
            [...counts].filter(([, count]) => count >= 3).map(([line]) => line)
        );
        pages.forEach((page, index) => {
            pages[index] = page.split("\n")
                .filter(line => !boilerplate.has(line.trim()))
                .join("\n");
        });
    }
    return pages.join("\n\n")
        .replace(/^(.{1,120})\n\1(?:\n|$)/gm, "$1\n")
        .replace(/[\t ]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

module.exports = { normalizeSourceText };
