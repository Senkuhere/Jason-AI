// render-pdf.js: turns a document blueprint (see doc-spec.js) into a PDF with the same look as the Word file.
// Uses the "pdfmake" package: install it with   npm install pdfmake
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import pdfmake from "pdfmake";

import { getPageSize, getTemplate } from "./doc-templates.js";
import { columnWeights, outline, parseInline } from "./doc-spec.js";

const require = createRequire(import.meta.url);

// Safety rules for pdfmake: it may never download anything from the internet, and the only local files
// it may read are font files (documents made by Jason contain no images from outside)
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(filePath => /\.ttf$/i.test(String(filePath)));

// ---------- Fonts ----------
// The PDF has to carry its own fonts. Windows already has Times New Roman, Calibri and Arial, so those are used
// when they are found. If a font is missing (or on another system), the Roboto font that comes with pdfmake is used.
const WINDOWS_FONTS = {
    "Times New Roman": ["times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"],
    "Calibri": ["calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"],
    "Arial": ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"]
};

function pickFont(wanted) {
    const folder = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
    const files = WINDOWS_FONTS[wanted];

    if (files) {
        const full = files.map(file => path.join(folder, file));

        if (full.every(file => fs.existsSync(file))) {
            return { name: wanted, files: { normal: full[0], bold: full[1], italics: full[2], bolditalics: full[3] } };
        }
    }

    const roboto = path.join(path.dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");

    return {
        name: "Roboto",
        files: {
            normal: path.join(roboto, "Roboto-Regular.ttf"),
            bold: path.join(roboto, "Roboto-Medium.ttf"),
            italics: path.join(roboto, "Roboto-Italic.ttf"),
            bolditalics: path.join(roboto, "Roboto-MediumItalic.ttf")
        }
    };
}

// "**bold** and *italic*" -> pdfmake text pieces
const inline = (value, extra = {}) => {
    const parts = parseInline(value);
    if (parts.length === 0) return { text: " ", ...extra };

    return {
        text: parts.map(part => ({ text: part.text, bold: part.bold, italics: part.italic })),
        ...extra
    };
};

export async function renderPdf(spec, { template: templateName, outputPath }) {
    const template = getTemplate(templateName);
    const pageSize = getPageSize();
    const font = pickFont(template.font);

    pdfmake.setFonts({ [font.name]: font.files });

    const margins = {
        top: template.margins.top * 72, bottom: template.margins.bottom * 72,
        left: template.margins.left * 72, right: template.margins.right * 72
    };

    const contentWidth = pageSize.widthPt - margins.left - margins.right;
    const hasCover = spec.coverPage ?? template.coverPageByDefault;
    const shortTitle = spec.title.length > 60 ? spec.title.slice(0, 57) + "..." : spec.title;
    const accent = `#${template.accent}`;
    const grey = "#7F7F7F";
    const small = template.bodySize - 2;
    const after = template.paragraphAfter;
    const content = [];

    // ---------- Cover ----------
    if (hasCover) {
        const lines = [...spec.coverDetails];
        if (spec.author) lines.push(spec.author);
        if (spec.date) lines.push(spec.date);

        content.push({ text: "", margin: [0, Math.max((pageSize.heightPt - 360) / 3, 80), 0, 0] });
        content.push(inline(spec.title, { style: "coverTitle", alignment: "center" }));

        if (spec.subtitle) content.push(inline(spec.subtitle, { style: "coverSubtitle", alignment: "center" }));

        lines.forEach((line, index) => content.push(inline(line, {
            alignment: "center", fontSize: template.bodySize + 1, margin: [0, index === 0 ? 40 : 0, 0, 6]
        })));

        content.push({ text: "", pageBreak: "after" });
    } else {
        content.push(inline(spec.title, { style: "coverTitle", alignment: "left", margin: [0, 0, 0, spec.subtitle ? 4 : 12] }));
        if (spec.subtitle) content.push(inline(spec.subtitle, { style: "coverSubtitle", alignment: "left", margin: [0, 0, 0, 8] }));

        const meta = [spec.author, spec.date, ...spec.coverDetails].filter(Boolean).join("  |  ");

        if (meta) {
            content.push(inline(meta, { fontSize: small + 0.5, color: "#595959", margin: [0, 0, 0, 4] }));
            content.push({
                canvas: [{ type: "line", x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 1.2, lineColor: accent }],
                margin: [0, 0, 0, 14]
            });
        }
    }

    // ---------- Contents (with page numbers) ----------
    if (spec.tableOfContents) {
        content.push({
            toc: {
                title: { text: "Contents", style: "h1" },
                numberStyle: { bold: false }
            },
            margin: [0, 0, 0, 12]
        });

        content.push({ text: "", pageBreak: "after" });      // the content begins on a fresh page after the contents list
    }

    // ---------- Content ----------
    let h1 = 0;
    let h2 = 0;

    const heading = (value, level) => {
        let label = value;

        if (template.numberedHeadings) {
            if (level === 1) { h1++; h2 = 0; label = `${h1}. ${value}`; }
            if (level === 2) { h2++; label = `${h1}.${h2} ${value}`; }
        }

        return inline(label, {
            style: `h${level}`,
            headingMark: true,                 // lets the page-break rule keep a heading with the text after it
            tocItem: spec.tableOfContents && level <= 2,
            tocMargin: level === 2 ? [16, 0, 0, 0] : undefined
        });
    };

    for (const section of spec.sections) {
        if (section.heading) content.push(heading(section.heading, 1));

        for (const block of section.blocks) {
            if (block.type === "heading") {
                content.push(heading(block.text, block.level));
            } else if (block.type === "paragraph") {
                content.push(inline(block.text, { alignment: template.justify ? "justify" : "left", margin: [0, 0, 0, after] }));
            } else if (block.type === "bullets") {
                content.push({ ul: block.items.map(item => inline(item)), margin: [10, 0, 0, after], markerColor: accent });
            } else if (block.type === "numbered") {
                content.push({ ol: block.items.map(item => inline(item)), margin: [10, 0, 0, after] });
            } else if (block.type === "quote") {
                content.push({
                    table: { widths: ["*"], body: [[inline(block.text, { italics: true, color: "#404040", margin: [10, 4, 6, 4] })]] },
                    layout: { hLineWidth: () => 0, vLineWidth: index => (index === 0 ? 3 : 0), vLineColor: () => accent },
                    margin: [18, 4, 18, after + 2]
                });
            } else if (block.type === "callout") {
                content.push({
                    table: { widths: ["*"], body: [[inline(block.text, { fillColor: `#${template.calloutFill}`, margin: [10, 6, 8, 6] })]] },
                    layout: { hLineWidth: () => 0, vLineWidth: index => (index === 0 ? 4 : 0), vLineColor: () => accent },
                    margin: [6, 4, 6, after + 4]
                });
            } else if (block.type === "pagebreak") {
                content.push({ text: "", pageBreak: "after" });
            } else if (block.type === "table") {
                if (block.caption) {
                    content.push(inline(block.caption, { italics: true, fontSize: small + 0.5, margin: [0, 6, 0, 4], headingMark: true }));
                }

                const widths = columnWeights(block).map(share => Math.max(share * contentWidth, 40));
                const scale = contentWidth / widths.reduce((a, b) => a + b, 0);       // the widths fill the page width exactly
                const cellSize = template.bodySize - 1;

                const headerRow = block.headers.map(cell => inline(cell, {
                    bold: true, color: `#${template.tableHeaderText}`, fillColor: `#${template.tableHeaderFill}`, fontSize: cellSize
                }));

                const bodyRows = block.rows.map(row => row.map(cell => inline(cell, { fontSize: cellSize })));

                content.push({
                    table: {
                        headerRows: block.headers.length ? 1 : 0,     // the header repeats on every page
                        keepWithHeaderRows: 1,
                        dontBreakRows: true,                          // a row is never cut by a page break
                        widths: widths.map(width => width * scale),
                        body: [...(block.headers.length ? [headerRow] : []), ...bodyRows]
                    },
                    layout: {
                        hLineWidth: () => 0.5, vLineWidth: () => 0.5,
                        hLineColor: () => `#${template.tableBorder}`, vLineColor: () => `#${template.tableBorder}`,
                        paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4
                    },
                    lineHeight: 1.1,
                    margin: [0, 0, 0, after + 6]
                });
            }
        }
    }

    // ---------- References ----------
    if (spec.references.length) {
        content.push(inline("References", { style: "h1", headingMark: true, tocItem: spec.tableOfContents }));

        for (const reference of spec.references) {
            content.push(inline(reference, { margin: [24, 0, 0, 6], leadingIndent: -24, alignment: "left" }));
        }
    }

    // ---------- Page header and footer ----------
    const offset = hasCover ? 1 : 0;      // the cover page shows no number (but it still counts as page 1)

    const header = template.header === "none" ? undefined : currentPage => {
        if (currentPage <= offset) return null;

        return {
            text: shortTitle,
            alignment: template.header === "title-right" ? "right" : "left",
            italics: template.header === "title-right",
            fontSize: small,
            color: template.header === "title-left-line" ? accent : grey,
            margin: [margins.left, 30, margins.right, 0]
        };
    };

    const footer = (currentPage, pageCount) => {
        if (currentPage <= offset) return null;

        const number = currentPage;
        const total = pageCount;

        return {
            text: template.footer === "page-of-right" ? `Page ${number} of ${total}` : `${number}`,
            alignment: template.footer === "page-of-right" ? "right" : "center",
            fontSize: small,
            color: grey,
            margin: [margins.left, 0, margins.right, 28]
        };
    };

    // ---------- The document ----------
    const headingStyle = level => ({
        fontSize: template.headingSizes[level],
        bold: template.headingBold,
        color: `#${template.headingColor}`,
        margin: [0, level === 1 ? 14 : 10, 0, 6],
        lineHeight: 1.15,
        alignment: "left"
    });

    const definition = {
        info: { title: spec.title, author: spec.author || "Jason", creator: "Jason", subject: spec.subtitle || "" },
        pageSize: { width: pageSize.widthPt, height: pageSize.heightPt },
        pageMargins: [margins.left, margins.top, margins.right, margins.bottom],
        header,
        footer,
        defaultStyle: { font: font.name, fontSize: template.bodySize, lineHeight: template.lineSpacing },
        styles: {
            h1: headingStyle(1),
            h2: headingStyle(2),
            h3: headingStyle(3),
            coverTitle: { fontSize: 24, bold: true, color: `#${template.headingColor}`, lineHeight: 1.15, margin: [0, 0, 0, 12] },
            coverSubtitle: { fontSize: 14, color: "#595959", lineHeight: 1.15, margin: [0, 0, 0, 20] }
        },
        // A heading (or a table caption) is never left alone at the bottom of a page
        pageBreakBefore: (node, followingNodesOnPage) => Boolean(node.headingMark) && followingNodesOnPage.length < 1,
        content
    };

    await pdfmake.createPdf(definition).write(outputPath);
    return outputPath;
}
