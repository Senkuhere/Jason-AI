// doc-templates.js: how each kind of document LOOKS. Fonts, sizes, colors, spacing and page layout all live here,
// so every document made with a template looks the same, no matter what the AI writes.
// To add a template, copy one of the entries below and change the values.

// Page sizes. Letter ("short bond") is the default. Change it with DOCUMENT_PAGE_SIZE=a4 or long in .env.
export const PAGE_SIZES = {
    letter: { name: "Letter (8.5 x 11 in)", widthTwips: 12240, heightTwips: 15840, widthPt: 612, heightPt: 792 },
    a4:     { name: "A4",                    widthTwips: 11906, heightTwips: 16838, widthPt: 595.28, heightPt: 841.89 },
    long:   { name: "Long bond (8.5 x 13 in)", widthTwips: 12240, heightTwips: 18720, widthPt: 612, heightPt: 936 }
};

export function getPageSize() {
    return PAGE_SIZES[String(process.env.DOCUMENT_PAGE_SIZE || "letter").toLowerCase()] || PAGE_SIZES.letter;
}

// Sizes are in points (pt). Margins are in inches. lineSpacing 1 = single, 1.5 = one and a half.
export const TEMPLATES = {
    academic: {
        label: "Academic (schoolwork, reports, essays, proposals)",
        font: "Times New Roman",
        bodySize: 12,
        lineSpacing: 1.5,
        paragraphAfter: 8,
        justify: true,
        margins: { top: 1, bottom: 1, left: 1.25, right: 1 },
        headingSizes: { 1: 14, 2: 13, 3: 12 },
        headingBold: true,
        numberedHeadings: false,
        coverPageByDefault: true,
        headingColor: "000000",
        accent: "000000",
        tableHeaderFill: "D9D9D9",
        tableHeaderText: "000000",
        tableBorder: "808080",
        calloutFill: "F2F2F2",
        header: "title-right",     // a short title at the top right of each page
        footer: "page-center"      // the page number at the bottom centre
    },

    business: {
        label: "Business (proposals, memos, plans, formal reports)",
        font: "Calibri",
        bodySize: 11,
        lineSpacing: 1.15,
        paragraphAfter: 8,
        justify: false,
        margins: { top: 1, bottom: 1, left: 1, right: 1 },
        headingSizes: { 1: 16, 2: 13, 3: 11.5 },
        headingBold: true,
        numberedHeadings: true,
        coverPageByDefault: false,
        headingColor: "1F3864",
        accent: "2E75B6",
        tableHeaderFill: "1F3864",
        tableHeaderText: "FFFFFF",
        tableBorder: "BFBFBF",
        calloutFill: "EAF1FB",
        header: "title-left-line",
        footer: "page-of-right"
    },

    general: {
        label: "General (handouts, summaries, reviewers, activity sheets, letters)",
        font: "Arial",
        bodySize: 11,
        lineSpacing: 1.2,
        paragraphAfter: 8,
        justify: false,
        margins: { top: 1, bottom: 1, left: 1, right: 1 },
        headingSizes: { 1: 16, 2: 13, 3: 11.5 },
        headingBold: true,
        numberedHeadings: false,
        coverPageByDefault: false,
        headingColor: "2F5496",
        accent: "2F5496",
        tableHeaderFill: "DCE6F2",
        tableHeaderText: "1F2937",
        tableBorder: "A6A6A6",
        calloutFill: "F3F6FA",
        header: "none",
        footer: "page-center"
    }
};

export function getTemplate(name) {
    return TEMPLATES[String(name || "").toLowerCase()] || TEMPLATES.general;
}

export function templateNames() {
    return Object.keys(TEMPLATES);
}
