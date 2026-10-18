import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";
import { PROJECT_ROOT } from "../file_tools/file-tool.js";

const DEFAULT_CHARS = 20_000;
const MAX_CHARS_PER_CALL = 40_000;
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const PLAIN_TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yml", ".yaml",
    ".html", ".htm", ".css", ".js", ".mjs", ".py", ".log", ".ini", ".sql"
]);

// Parsing a big file once and paging through it should not re-parse every time
const textCache = new Map();

// Decode XML entities to plain text
function decodeXml(text) {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

// Convert XML content to plain text, preserving line breaks and removing tags
function xmlToText(xml) {
    return decodeXml(
        xml
            .replace(/<\/a:p>/g, "\n")
            .replace(/<a:br\s*\/>/g, "\n")
            .replace(/<[^>]+>/g, "")
    )
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// Extract the slide number from a PowerPoint slide file name (e.g., "slide3.xml" -> 3)
function slideNumber(fileName) {
    return Number(fileName.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

// Extract text from a PDF buffer, returning a string with page breaks and page numbers
async function extractPdf(buffer) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });

    if (text.every(pageText => !pageText.trim())) {
        return (
            "[This PDF has no readable text layer. It is probably a scan or " +
            "made of images, so the text cannot be extracted.]"
        );
    }

    return text
        .map(
            (pageText, index) =>
                `--- Page ${index + 1} of ${totalPages} ---\n${pageText.trim()}`
        )
        .join("\n\n");
}

// Extract text from a DOCX buffer using Mammoth, returning the raw text content
async function extractDocx(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

// Extract text from a PPTX buffer by reading the slides and speaker notes, returning a string with slide breaks
async function extractPptx(buffer) {
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => slideNumber(a) - slideNumber(b));

    const parts = [];

    for (const slideFile of slideFiles) {
        const number = slideNumber(slideFile);
        const slideText = xmlToText(await zip.file(slideFile).async("string"));

        let block = `--- Slide ${number} ---\n${slideText}`;

        const notesFile = zip.file(`ppt/notesSlides/notesSlide${number}.xml`);
        if (notesFile) {
            const notes = xmlToText(await notesFile.async("string"));
            if (notes) block += `\n[Speaker notes: ${notes}]`;
        }

        parts.push(block);
    }

    return parts.join("\n\n");
}

// Extract text from a spreadsheet buffer, returning a string with sheet breaks
function extractSpreadsheet(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    return workbook.SheetNames
        .map(name => {
            const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
            return `--- Sheet: ${name} ---\n${csv.trim()}`;
        })
        .join("\n\n");
}

// Determine the file type based on the extension and extract its text content accordingly
async function extractContent(extension, buffer) {
    if (extension === ".pdf") return extractPdf(buffer);
    if (extension === ".docx") return extractDocx(buffer);
    if (extension === ".pptx") return extractPptx(buffer);
    if (extension === ".xlsx" || extension === ".xls") return extractSpreadsheet(buffer);
    if (PLAIN_TEXT_EXTENSIONS.has(extension)) return buffer.toString("utf8");

    if (extension === ".doc" || extension === ".ppt") {
        throw new Error(
            `Old ${extension} files are not supported. Ask the user to save it as ` +
            `${extension === ".doc" ? ".docx" : ".pptx"} and try again.`
        );
    }

    throw new Error(
        `Unsupported file type: ${extension || "none"}. ` +
        "Supported: pdf, docx, pptx, xlsx, xls, and text files (txt, md, csv, json, code)."
    );
}

// Read a document file, extract its text content, and return a paginated result with metadata
export async function readDocument({
    filePath,
    startChar = 0,
    maxChars = DEFAULT_CHARS
} = {}) {
    if (typeof filePath !== "string" || !filePath.trim()) {
        throw new Error("filePath is required.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, filePath.trim());
    const fileName = path.basename(absolutePath).toLowerCase();

    // Keep API keys and passwords out of the model's context
    if (fileName.startsWith(".env")) {
        throw new Error("Access denied: sensitive file.");
    }

    let info;
    try {
        info = await stat(absolutePath);
    } catch {
        throw new Error(`File not found: ${absolutePath}`);
    }

    if (!info.isFile()) {
        throw new Error(`That path is not a file: ${absolutePath}`);
    }

    if (info.size > MAX_FILE_BYTES) {
        throw new Error("File is too large to read (30 MB max).");
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const cacheKey = `${absolutePath}:${info.mtimeMs}`;

    let text = textCache.get(cacheKey);

    if (text === undefined) {
        const buffer = await readFile(absolutePath);
        text = (await extractContent(extension, buffer)).trim();

        textCache.set(cacheKey, text);
        if (textCache.size > 5) {
            textCache.delete(textCache.keys().next().value);
        }
    }

    const start = Math.max(0, Number(startChar) || 0);
    const limit = Math.min(
        Math.max(Number(maxChars) || DEFAULT_CHARS, 1),
        MAX_CHARS_PER_CALL
    );
    const end = Math.min(start + limit, text.length);

    return {
        ok: true,
        file: absolutePath,
        type: extension,
        totalChars: text.length,
        startChar: start,
        endChar: end,
        truncated: end < text.length,
        nextStartChar: end < text.length ? end : null,
        text: text.slice(start, end)
    };
}