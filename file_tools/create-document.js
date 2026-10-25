// create-document.js: the one function Jason calls to make a document.
//   1. the AI writes the content as a blueprint (doc-writer.js)
//   2. the blueprint is turned into a Word file and/or a PDF with the chosen template (render-docx.js, render-pdf.js)
//   3. the files are saved in the documents folder, with the blueprint kept next to them so the document can be edited later
//
// Where documents are saved: DOCUMENTS_FOLDER in .env, otherwise  Documents\Jason Documents  in your user folder.
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { countWords, outline } from "./doc-spec.js";
import { getPageSize, getTemplate, templateNames } from "./doc-templates.js";
import { documentKinds, writeBlueprint } from "./doc-writer.js";
import { renderDocx } from "./render-docx.js";
import { renderPdf } from "./render-pdf.js";

const FORMATS = ["docx", "pdf"];

// Which template suits which kind, when none was chosen
const DEFAULT_TEMPLATE = {
    report: "academic", essay: "academic",
    proposal: "business", minutes: "business",
    letter: "general", handout: "general", summary: "general", reviewer: "general", activity_sheet: "general", general: "general"
};

export function documentsFolder() {
    return process.env.DOCUMENTS_FOLDER || path.join(os.homedir(), "Documents", "Jason Documents");
}

// "My Report: Draft/1" -> "My Report Draft 1" (safe to use as a file name on Windows)
function safeName(value) {
    return String(value || "Document")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 70) || "Document";
}

// A name that does not exist yet: "Report.docx", then "Report (2).docx", ...
async function freeBaseName(folder, base, extensions) {
    for (let number = 1; number < 200; number++) {
        const candidate = number === 1 ? base : `${base} (${number})`;
        const taken = await Promise.all(extensions.map(ext =>
            fs.access(path.join(folder, `${candidate}.${ext}`)).then(() => true, () => false)));

        if (!taken.some(Boolean)) return candidate;
    }

    return `${base} ${Date.now()}`;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export async function createDocument({
    kind, title, brief, content, template, formats, length, pages, coverPage, tableOfContents, author, language
} = {}) {
    if (typeof brief !== "string" || brief.trim().length < 5) {
        throw new Error("A description of the document is required (what it is about and what it should contain).");
    }

    const chosenKind = documentKinds().includes(String(kind || "").toLowerCase()) ? String(kind).toLowerCase() : "general";
    const chosenTemplate = templateNames().includes(String(template || "").toLowerCase())
        ? String(template).toLowerCase()
        : DEFAULT_TEMPLATE[chosenKind];

    const chosenFormats = [...new Set((Array.isArray(formats) ? formats : [formats])
        .map(format => String(format || "").toLowerCase())
        .filter(format => FORMATS.includes(format)))];

    if (chosenFormats.length === 0) chosenFormats.push("docx");

    // 1. The AI writes the content
    const spec = await writeBlueprint({
        kind: chosenKind, template: chosenTemplate, title, brief, content, length, pages, language, author
    });

    // The caller's choices win over the AI's
    if (typeof coverPage === "boolean") spec.coverPage = coverPage;
    if (typeof tableOfContents === "boolean") spec.tableOfContents = tableOfContents;
    if (!spec.date && getTemplate(chosenTemplate).coverPageByDefault) spec.date = "";

    // 2. Where to save
    const folder = documentsFolder();
    await fs.mkdir(folder, { recursive: true });

    const base = await freeBaseName(folder, `${safeName(spec.title)} - ${today()}`, chosenFormats);

    // 3. Make the files (one failing does not lose the other)
    const files = [];
    const problems = [];

    for (const format of chosenFormats) {
        const outputPath = path.join(folder, `${base}.${format}`);

        try {
            if (format === "docx") await renderDocx(spec, { template: chosenTemplate, outputPath });
            if (format === "pdf") await renderPdf(spec, { template: chosenTemplate, outputPath });

            const { size } = await fs.stat(outputPath);
            files.push({ format, path: outputPath, sizeKB: Math.max(1, Math.round(size / 1024)) });
        } catch (error) {
            problems.push(`${format}: ${error.message}`);
        }
    }

    if (files.length === 0) throw new Error(`The files could not be made. ${problems.join(" | ")}`);

    // 4. Keep the blueprint, so the document can be changed later without starting again
    try {
        const specFolder = path.join(folder, ".jason_specs");
        await fs.mkdir(specFolder, { recursive: true });
        await fs.writeFile(
            path.join(specFolder, `${base}.json`),
            JSON.stringify({ kind: chosenKind, template: chosenTemplate, brief, createdAt: new Date().toISOString(), spec }, null, 2),
            "utf8"
        );
    } catch {
        // not essential
    }

    return {
        ok: true,
        execution: { type: "create_document", platform: "windows" },
        title: spec.title,
        kind: chosenKind,
        template: chosenTemplate,
        pageSize: getPageSize().name,
        folder,
        files,
        words: countWords(spec),
        headings: outline(spec).filter(entry => entry.level === 1).map(entry => entry.text).slice(0, 12),
        notesForUser: spec.notesForUser || "",
        problems
    };
}
