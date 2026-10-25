// render-docx.js: turns a document blueprint (see doc-spec.js) into a real Word file (.docx).
// Uses the "docx" package: install it with   npm install docx
import { promises as fs } from "fs";
import {
    AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, LineRuleType, NumberFormat,
    Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType
} from "docx";

import { getPageSize, getTemplate } from "./doc-templates.js";
import { columnWeights, outline, parseInline } from "./doc-spec.js";

const INCH = 1440;                                   // twips (the unit Word uses) in one inch
const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };

// ---------- Text with **bold** and *italic* ----------
function runs(value, base = {}) {
    const parts = parseInline(value);
    if (parts.length === 0) return [new TextRun({ text: "", ...base })];

    return parts.map(part => new TextRun({
        text: part.text,
        bold: part.bold || base.bold,
        italics: part.italic || base.italics,
        ...Object.fromEntries(Object.entries(base).filter(([key]) => key !== "bold" && key !== "italics"))
    }));
}

// ---------- Table column widths (in twips), from the shared shares in doc-spec.js ----------
function columnWidths(table, totalWidth) {
    const widths = columnWeights(table).map(share => Math.max(Math.floor(share * totalWidth), 900));

    // The widths must add up to exactly the table width
    widths[widths.length - 1] += totalWidth - widths.reduce((a, b) => a + b, 0);
    return widths;
}

export async function renderDocx(spec, { template: templateName, outputPath }) {
    const template = getTemplate(templateName);
    const page = getPageSize();
    const size = Math.round(template.bodySize * 2);                // Word measures text in half-points
    const lineSpacing = Math.round(240 * template.lineSpacing);
    const after = Math.round(template.paragraphAfter * 20);

    const margins = {
        top: Math.round(template.margins.top * INCH),
        bottom: Math.round(template.margins.bottom * INCH),
        left: Math.round(template.margins.left * INCH),
        right: Math.round(template.margins.right * INCH),
        header: 708,
        footer: 708
    };

    const contentWidth = page.widthTwips - margins.left - margins.right;
    const hasCover = spec.coverPage ?? template.coverPageByDefault;
    const firstPageNumber = hasCover ? 2 : 1;      // the cover counts as page 1 (it just shows no number), so "Page X of Y" and the contents list always agree
    const shortTitle = spec.title.length > 60 ? spec.title.slice(0, 57) + "..." : spec.title;
    const body = [];
    let numberedLists = 0;
    let startOnNewPage = false;

    // ---------- Headings (numbered if the template says so) ----------
    let h1 = 0;
    let h2 = 0;

    const heading = (value, level) => {
        let label = value;

        if (template.numberedHeadings) {
            if (level === 1) { h1++; h2 = 0; label = `${h1}. ${value}`; }
            if (level === 2) { h2++; label = `${h1}.${h2} ${value}`; }
        }

        const breakFirst = startOnNewPage;
        startOnNewPage = false;

        return new Paragraph({
            heading: HEADINGS[level],
            keepNext: true,
            pageBreakBefore: breakFirst,
            children: [new TextRun({ text: label })]
        });
    };

    // ---------- Cover page ----------
    const cover = [];

    if (hasCover) {
        // The title starts about a third of the way down the cover page
        const coverTop = Math.round((page.heightTwips - margins.top - margins.bottom) / 3.2);

        cover.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: coverTop, after: 240, line: 276, lineRule: LineRuleType.AUTO },
            children: runs(spec.title, { bold: true, size: 40, color: template.headingColor })
        }));

        if (spec.subtitle) {
            cover.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 600, line: 276, lineRule: LineRuleType.AUTO },
                children: runs(spec.subtitle, { size: 28, color: "595959" })
            }));
        }

        const details = [...spec.coverDetails];
        if (spec.author) details.push(spec.author);
        if (spec.date) details.push(spec.date);

        details.forEach((line, index) => cover.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: index === 0 ? 600 : 0, after: 120, line: 276, lineRule: LineRuleType.AUTO },
            children: runs(line, { size: Math.round((template.bodySize + 1) * 2) })
        })));
    } else {
        // No cover page: the title sits at the top of the first page
        body.push(new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: spec.subtitle ? 80 : 240, line: 276, lineRule: LineRuleType.AUTO },
            children: runs(spec.title, { bold: true, size: 40, color: template.headingColor })
        }));

        if (spec.subtitle) {
            body.push(new Paragraph({
                spacing: { after: 160, line: 276, lineRule: LineRuleType.AUTO },
                children: runs(spec.subtitle, { size: 26, color: "595959" })
            }));
        }

        const meta = [spec.author, spec.date, ...spec.coverDetails].filter(Boolean).join("  |  ");

        if (meta) {
            body.push(new Paragraph({
                spacing: { after: 280, line: 276, lineRule: LineRuleType.AUTO },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: template.accent, space: 6 } },
                children: runs(meta, { size: 20, color: "595959" })
            }));
        }
    }

    // ---------- Contents list (without page numbers, so it is always correct) ----------
    if (spec.tableOfContents) {
        body.push(new Paragraph({
            spacing: { before: 120, after: 160 },
            keepNext: true,
            children: [new TextRun({ text: "Contents", bold: true, size: Math.round(template.headingSizes[1] * 2), color: template.headingColor })]
        }));

        for (const entry of outline(spec, template.numberedHeadings)) {
            body.push(new Paragraph({
                spacing: { after: 60, line: 276, lineRule: LineRuleType.AUTO },
                indent: { left: (entry.level - 1) * 360 },
                children: [new TextRun({ text: entry.text, size })]
            }));
        }

        startOnNewPage = true;      // the content begins on a fresh page after the contents list
    }

    // ---------- Content ----------
    for (const section of spec.sections) {
        if (section.heading) body.push(heading(section.heading, 1));

        for (const block of section.blocks) {
            if (block.type === "heading") {
                body.push(heading(block.text, block.level));
            } else if (block.type === "paragraph") {
                body.push(new Paragraph({
                    alignment: template.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
                    children: runs(block.text)
                }));
            } else if (block.type === "bullets") {
                block.items.forEach((item, index) => {
                    body.push(new Paragraph({
                        numbering: { reference: "bullets", level: 0 },
                        spacing: { after: index === block.items.length - 1 ? after : 60 },
                        children: runs(item)
                    }));
                });
            } else if (block.type === "numbered") {
                numberedLists++;                      // each list starts again at 1

                block.items.forEach((item, index) => {
                    body.push(new Paragraph({
                        numbering: { reference: "numbers", level: 0, instance: numberedLists },
                        spacing: { after: index === block.items.length - 1 ? after : 60 },
                        children: runs(item)
                    }));
                });
            } else if (block.type === "quote") {
                body.push(new Paragraph({
                    indent: { left: 540, right: 540 },
                    spacing: { before: 120, after: 160 },
                    border: { left: { style: BorderStyle.SINGLE, size: 18, color: template.accent, space: 10 } },
                    children: runs(block.text, { italics: true, color: "404040" })
                }));
            } else if (block.type === "callout") {
                body.push(new Paragraph({
                    indent: { left: 180, right: 180 },
                    spacing: { before: 120, after: 180 },
                    shading: { type: ShadingType.CLEAR, fill: template.calloutFill, color: "auto" },
                    border: { left: { style: BorderStyle.SINGLE, size: 24, color: template.accent, space: 8 } },
                    children: runs(block.text)
                }));
            } else if (block.type === "pagebreak") {
                body.push(new Paragraph({ pageBreakBefore: true, children: [] }));
            } else if (block.type === "table") {
                if (block.caption) {
                    body.push(new Paragraph({
                        keepNext: true,
                        spacing: { before: 120, after: 80 },
                        children: runs(block.caption, { italics: true, size: Math.round((template.bodySize - 1) * 2) })
                    }));
                }

                const widths = columnWidths(block, contentWidth);
                const line = { style: BorderStyle.SINGLE, size: 4, color: template.tableBorder };
                const borders = { top: line, bottom: line, left: line, right: line };

                const makeRow = (cells, isHeader) => new TableRow({
                    tableHeader: isHeader,          // a header row repeats on every page the table spans
                    cantSplit: true,                // a row is never cut in half by a page break
                    children: cells.map((cell, column) => new TableCell({
                        width: { size: widths[column], type: WidthType.DXA },
                        borders,
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 70, bottom: 70, left: 110, right: 110 },
                        shading: isHeader
                            ? { type: ShadingType.CLEAR, fill: template.tableHeaderFill, color: "auto" }
                            : undefined,
                        children: [new Paragraph({
                            spacing: { after: 0, line: 252, lineRule: LineRuleType.AUTO },
                            children: runs(cell, isHeader
                                ? { bold: true, color: template.tableHeaderText, size: Math.round((template.bodySize - 1) * 2) }
                                : { size: Math.round((template.bodySize - 1) * 2) })
                        })]
                    }))
                });

                body.push(new Table({
                    width: { size: contentWidth, type: WidthType.DXA },
                    columnWidths: widths,
                    rows: [
                        ...(block.headers.length ? [makeRow(block.headers, true)] : []),
                        ...block.rows.map(row => makeRow(row, false))
                    ]
                }));

                body.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
            }
        }
    }

    // ---------- References ----------
    if (spec.references.length) {
        body.push(new Paragraph({
            heading: HEADINGS[1],
            keepNext: true,
            children: [new TextRun({ text: "References" })]
        }));

        for (const reference of spec.references) {
            body.push(new Paragraph({
                indent: { left: 720, hanging: 720 },          // the hanging indent used in reference lists
                spacing: { after: 120 },
                children: runs(reference)
            }));
        }
    }

    // ---------- Page header and footer ----------
    const grey = "7F7F7F";
    const small = Math.round((template.bodySize - 2) * 2);

    const header = template.header === "none" ? undefined : new Header({
        children: [new Paragraph({
            alignment: template.header === "title-right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
            border: template.header === "title-left-line"
                ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: template.accent, space: 4 } }
                : undefined,
            children: [new TextRun({
                text: shortTitle, size: small,
                color: template.header === "title-left-line" ? template.accent : grey,
                italics: template.header === "title-right"
            })]
        })]
    });

    const footer = new Footer({
        children: [new Paragraph({
            alignment: template.footer === "page-of-right" ? AlignmentType.RIGHT : AlignmentType.CENTER,
            children: template.footer === "page-of-right"
                ? [
                    new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: small, color: grey })
                ]
                : [new TextRun({ children: [PageNumber.CURRENT], size: small, color: grey })]
        })]
    });

    const pageProperties = {
        page: {
            size: { width: page.widthTwips, height: page.heightTwips },
            margin: margins
        }
    };

    const sections = [];

    if (hasCover) {
        sections.push({
            properties: { ...pageProperties },
            children: cover
        });
    }

    sections.push({
        properties: {
            page: {
                ...pageProperties.page,
                pageNumbers: { start: firstPageNumber, formatType: NumberFormat.DECIMAL }
            }
        },
        headers: header ? { default: header } : undefined,
        footers: { default: footer },
        children: body
    });

    // ---------- The document itself ----------
    const headingStyle = (id, name, level) => ({
        id, name,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
            font: template.font,
            size: Math.round(template.headingSizes[level] * 2),
            bold: template.headingBold,
            color: template.headingColor
        },
        paragraph: {
            spacing: { before: level === 1 ? 360 : 240, after: 120, line: 276, lineRule: LineRuleType.AUTO },
            outlineLevel: level - 1,
            alignment: AlignmentType.LEFT
        }
    });

    const document = new Document({
        creator: spec.author || "Jason",
        title: spec.title,
        description: spec.subtitle || "",
        styles: {
            default: {
                document: {
                    run: { font: template.font, size },
                    paragraph: { spacing: { line: lineSpacing, lineRule: LineRuleType.AUTO, after } }
                }
            },
            paragraphStyles: [
                headingStyle("Heading1", "Heading 1", 1),
                headingStyle("Heading2", "Heading 2", 2),
                headingStyle("Heading3", "Heading 3", 3)
            ]
        },
        numbering: {
            config: [
                {
                    reference: "bullets",
                    levels: [{
                        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                    }]
                },
                {
                    reference: "numbers",
                    levels: [{
                        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                    }]
                }
            ]
        },
        sections
    });

    await fs.writeFile(outputPath, await Packer.toBuffer(document));
    return outputPath;
}
