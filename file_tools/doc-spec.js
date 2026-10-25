// doc-spec.js: the "blueprint" of a document. The AI writes the CONTENT as a blueprint (headings, paragraphs,
// lists, tables), and the renderers turn the same blueprint into Word and PDF. This file checks the blueprint,
// repairs small mistakes, and enforces limits, so a badly written blueprint can never crash a renderer.

export const BLOCK_TYPES = ["paragraph", "bullets", "numbered", "table", "quote", "callout", "heading", "pagebreak"];

const LIMITS = {
    sections: 30,
    blocksPerSection: 60,
    textLength: 5000,
    listItems: 40,
    tableRows: 80,
    tableColumns: 8,
    references: 40,
    coverLines: 8
};

const text = (value, max = LIMITS.textLength) =>
    String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);

// "**bold** and *italic*" -> [{ text, bold, italic }]. Stray asterisks are removed, never printed.
export function parseInline(value) {
    const source = String(value ?? "");
    const parts = [];
    const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    let last = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
        if (match.index > last) parts.push({ text: source.slice(last, match.index) });

        const token = match[0];

        parts.push(token.startsWith("**")
            ? { text: token.slice(2, -2), bold: true }
            : { text: token.slice(1, -1), italic: true });

        last = match.index + token.length;
    }

    if (last < source.length) parts.push({ text: source.slice(last) });

    return parts
        .map(part => ({ ...part, text: part.text.replace(/\*/g, "") }))
        .filter(part => part.text.length > 0);
}

export const plainText = value => parseInline(value).map(part => part.text).join("");

function normalizeBlock(raw) {
    if (!raw || typeof raw !== "object") return null;

    const type = String(raw.type || "").toLowerCase();
    if (!BLOCK_TYPES.includes(type)) {
        // A block with only text is treated as a paragraph
        return raw.text ? { type: "paragraph", text: text(raw.text) } : null;
    }

    if (type === "pagebreak") return { type };

    if (type === "paragraph" || type === "quote" || type === "callout") {
        const body = text(raw.text);
        return body ? { type, text: body } : null;
    }

    if (type === "heading") {
        const body = text(raw.text, 200);
        const level = Math.min(Math.max(Number(raw.level) || 2, 2), 3);
        return body ? { type, level, text: body } : null;
    }

    if (type === "bullets" || type === "numbered") {
        const items = (Array.isArray(raw.items) ? raw.items : [])
            .map(item => text(item, 600))
            .filter(Boolean)
            .slice(0, LIMITS.listItems);

        return items.length ? { type, items } : null;
    }

    if (type === "table") {
        const headers = (Array.isArray(raw.headers) ? raw.headers : [])
            .map(item => text(item, 80))
            .slice(0, LIMITS.tableColumns);

        let rows = (Array.isArray(raw.rows) ? raw.rows : [])
            .filter(Array.isArray)
            .slice(0, LIMITS.tableRows);

        const columns = Math.max(headers.length, ...rows.map(row => row.length), 0);
        if (columns === 0) return null;

        const width = Math.min(columns, LIMITS.tableColumns);

        // Every row gets exactly as many cells as there are columns
        const fix = row => Array.from({ length: width }, (_, index) => text(row[index] ?? "", 400));

        return {
            type,
            caption: text(raw.caption, 200),
            headers: headers.length ? fix(headers) : [],
            rows: rows.map(fix)
        };
    }

    return null;
}

// Turns whatever the AI returned into a clean, safe blueprint. Throws a readable error if nothing usable is there.
export function normalizeSpec(raw, options = {}) {
    if (!raw || typeof raw !== "object") throw new Error("The document blueprint was empty.");

    const sections = (Array.isArray(raw.sections) ? raw.sections : [])
        .slice(0, LIMITS.sections)
        .map(section => ({
            heading: text(section?.heading, 200),
            blocks: (Array.isArray(section?.blocks) ? section.blocks : [])
                .slice(0, LIMITS.blocksPerSection)
                .map(normalizeBlock)
                .filter(Boolean)
        }))
        .filter(section => section.heading || section.blocks.length);

    if (sections.length === 0) throw new Error("The document blueprint had no content.");

    // A title the user asked for wins over the one the AI chose
    const title = text(options.title || raw.title, 200) || "Untitled document";

    return {
        title,
        subtitle: text(raw.subtitle, 250),
        author: text(raw.author || options.author, 120),
        date: text(raw.date, 60),
        coverDetails: (Array.isArray(raw.coverDetails) ? raw.coverDetails : [])
            .map(line => text(line, 160)).filter(Boolean).slice(0, LIMITS.coverLines),
        coverPage: typeof raw.coverPage === "boolean" ? raw.coverPage : undefined,
        tableOfContents: raw.tableOfContents === true,
        sections,
        references: (Array.isArray(raw.references) ? raw.references : [])
            .map(item => text(item, 500)).filter(Boolean).slice(0, LIMITS.references),
        // Anything the user should check before handing the document in
        notesForUser: text(raw.notesForUser, 600)
    };
}

// Counts the words in a blueprint (for a rough size)
export function countWords(spec) {
    let words = 0;
    const add = value => { words += (String(value || "").match(/\S+/g) || []).length; };

    for (const section of spec.sections) {
        add(section.heading);
        for (const block of section.blocks) {
            add(block.text);
            (block.items || []).forEach(add);
            (block.rows || []).forEach(row => row.forEach(add));
        }
    }

    spec.references.forEach(add);
    return words;
}

// The headings in order, for the table of contents
export function outline(spec, numbered = false) {
    const entries = [];
    let h1 = 0;

    for (const section of spec.sections) {
        if (section.heading) {
            h1++;
            entries.push({ level: 1, text: numbered ? `${h1}. ${section.heading}` : section.heading });
        }

        let h2 = 0;

        for (const block of section.blocks) {
            if (block.type === "heading") {
                if (block.level === 2) {
                    h2++;
                    entries.push({ level: 2, text: numbered ? `${h1}.${h2} ${block.text}` : block.text });
                }
            }
        }
    }

    if (spec.references.length) entries.push({ level: 1, text: "References" });
    return entries;
}

// How wide each table column should be, as shares of the table width (they add up to 1).
// Columns with longer text get more room, but never too little or too much.
export function columnWeights(table) {
    const columns = table.headers.length || table.rows[0].length;

    const weights = Array.from({ length: columns }, (_, column) => {
        const cells = [table.headers[column], ...table.rows.map(row => row[column])].filter(Boolean);
        const average = cells.reduce((sum, cell) => sum + String(cell).length, 0) / Math.max(cells.length, 1);
        const longestWord = Math.max(...cells.map(cell => Math.max(...String(cell).split(/\s+/).map(word => word.length), 1)));
        return Math.min(Math.max(average, longestWord, 6), 60);
    });

    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(weight => weight / sum);
}
