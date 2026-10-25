// doc-writer.js: asks Gemini to WRITE the document (as a blueprint, see doc-spec.js). It does not draw anything:
// the look comes from the templates and the renderers, so the AI only has to think about content and structure.
//
// Settings in .env (all optional):
//   GEMINI_DOCUMENT_MODEL     which model writes documents (default: the same model Jason uses)
//   GEMINI_DOCUMENT_THINKING  how much it thinks first: LOW (default), MEDIUM or HIGH. Higher = better, slower.
import { GoogleGenAI } from "@google/genai";

import { normalizeSpec } from "./doc-spec.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_DOCUMENT_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const WRITE_TIMEOUT_MS = 150_000;

// What each kind of document should contain. The AI may adapt this when the brief asks for something different.
const KIND_GUIDE = {
    report:
        "A report: a clear introduction (purpose and scope), the main body in logical sections " +
        "(for example background, method or approach, findings or discussion), a conclusion, and recommendations if useful. " +
        "Use a table when comparing items or numbers. Use a title page.",
    essay:
        "An essay: an introduction that ends with a clear thesis, body sections where each paragraph makes one point and " +
        "supports it, and a conclusion. Flowing paragraphs only: no bullet lists and no tables. Use a title page.",
    proposal:
        "A proposal: background and problem, objectives, scope, the plan or methodology, a timeline (as a table), " +
        "resources or budget (as a table) if relevant, expected results, and a short conclusion.",
    letter:
        "A formal letter: NO title page. Start with the sender's details and the date as short paragraphs, then the recipient, " +
        "a subject line in bold, the greeting, the body in short paragraphs, and a closing with the signature name. " +
        "Use only 'paragraph' blocks and one section without a heading.",
    handout:
        "A handout: concise and easy to scan. Short sections with clear headings, bullet lists, a table of key terms or " +
        "comparisons if useful, and callouts for the most important points. No title page.",
    summary:
        "A summary: the main points first, then the supporting details, in short sections. Easy to scan. No title page.",
    reviewer:
        "A study reviewer: organised by topic. For each topic give the key ideas as short bullet points, a table of terms " +
        "and meanings where it helps, and a few practice questions at the end. No title page.",
    activity_sheet:
        "An activity sheet: a title, a short instructions callout, then numbered tasks or questions of increasing difficulty. " +
        "Leave work lines out. Include a line for name and date at the top as a paragraph. No title page.",
    minutes:
        "Meeting minutes: date, attendees, agenda, discussion points and decisions per agenda item, and a table of action items " +
        "(task, person responsible, due date). No title page.",
    general:
        "Choose the structure that best fits what was asked."
};

export function documentKinds() {
    return Object.keys(KIND_GUIDE);
}

// A rough target length in words
function targetWords({ length, pages, template }) {
    if (Number(pages) > 0) return Math.round(Number(pages) * (template === "academic" ? 300 : 430));

    return { short: 650, medium: 1500, long: 3000 }[String(length || "").toLowerCase()] || 1200;
}

const SCHEMA_TEXT = `
Reply with ONE JSON object only (no markdown fences, no explanation) shaped like this:
{
  "title": "document title",
  "subtitle": "optional subtitle or empty string",
  "author": "author name if given, otherwise empty string",
  "date": "a date line if appropriate, otherwise empty string",
  "coverDetails": ["optional lines for a title page, such as the course, the teacher, the school"],
  "coverPage": true or false,
  "tableOfContents": true or false,
  "sections": [
    {
      "heading": "section heading (empty string if the section has no heading)",
      "blocks": [
        {"type": "paragraph", "text": "..."},
        {"type": "heading", "level": 2, "text": "sub-heading"},
        {"type": "bullets", "items": ["...", "..."]},
        {"type": "numbered", "items": ["...", "..."]},
        {"type": "table", "caption": "Table 1. ...", "headers": ["...", "..."], "rows": [["...", "..."]]},
        {"type": "quote", "text": "..."},
        {"type": "callout", "text": "a key point or note that should stand out"}
      ]
    }
  ],
  "references": ["only real sources, in the citation style asked for"],
  "notesForUser": "short note about anything the user must check or fill in before using the document (empty string if nothing)"
}
In any text you may use **bold** and *italic*. Use nothing else for formatting.`;

function buildInstructions({ kind, template, language, words, hasSources }) {
    return `
You are an expert writer and editor who produces documents that are ready to hand to a teacher, a manager or a client.
You write the CONTENT and STRUCTURE only. A program turns it into Word and PDF files with consistent formatting,
so never describe the layout, never write page numbers, and never use markdown headings, HTML or emojis.

Kind of document: ${kind}. ${KIND_GUIDE[kind] || KIND_GUIDE.general}
Style template: ${template}${template === "academic" ? " (formal, precise, objective wording suitable for schoolwork)" : template === "business" ? " (professional, direct, well organised)" : " (clear, friendly and easy to read)"}.
Language: ${language || "English"}.
Length: about ${words} words in total (a table counts for its text). Do not pad. Be specific and useful rather than generic.

Honesty rules (very important):
- Never invent research results, survey data, statistics, quotations, names or sources.
- If the document needs data or facts the user did not provide, write the section so it explains what belongs there and use a
  clearly marked placeholder such as [Insert your survey results here]. Mention this in notesForUser.
- ${hasSources
        ? "Use the source material the user supplied. Do not add facts that contradict it."
        : "Use only general knowledge you are confident is correct. If unsure about a fact, leave it out."}
- Include "references" only if the user asked for them or supplied sources. If you add well-known textbooks or papers,
  only include ones you are certain exist, and say in notesForUser that the user must verify every reference. Otherwise use [].

Quality rules:
- Open with a clear purpose; end with a conclusion or next steps where the kind of document calls for one.
- Each paragraph makes one point. Prefer lists and tables only where they really help the reader.
- Tables: a header row, short cell text, 2 to 6 columns, no empty cells.
- Set coverPage to true only for formal reports, essays and proposals; false for letters, handouts, summaries, reviewers and sheets.
- Set tableOfContents to true only when the document has at least five headed sections.
${SCHEMA_TEXT}`;
}

// Reads the JSON the model returned, even if it wrapped it in a code fence
function parseJson(text) {
    const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start < 0 || end <= start) throw new Error("The writer did not return a document.");

    return JSON.parse(raw.slice(start, end + 1));
}

// Writes the document and returns a clean, checked blueprint
export async function writeBlueprint({
    kind = "general", template = "general", title, brief, content, length, pages, language, author
}) {
    const words = targetWords({ length, pages, template });
    const instructions = buildInstructions({ kind, template, language, words, hasSources: Boolean(content && content.trim()) });

    const request = [
        title ? `Title: ${title}` : "",
        `What the document is about and what it must contain:\n${brief}`,
        content ? `Source material and facts from the user (use these):\n${content}` : "",
        author ? `Author: ${author}` : ""
    ].filter(Boolean).join("\n\n");

    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const response = await Promise.race([
                ai.models.generateContent({
                    model: MODEL,
                    contents: request,
                    config: {
                        systemInstruction: instructions,
                        responseMimeType: "application/json",
                        maxOutputTokens: Math.min(32_000, words * 3 + 3000),
                        thinkingConfig: { thinkingLevel: process.env.GEMINI_DOCUMENT_THINKING || "LOW" }
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Writing the document took too long.")), WRITE_TIMEOUT_MS))
            ]);

            return normalizeSpec(parseJson(response.text), { title, author });
        } catch (error) {
            lastError = error;
            // A temporary network or server problem, or a damaged answer, is worth one more try
            if (attempt === 2) break;
        }
    }

    throw new Error(`The document could not be written: ${lastError?.message || "unknown problem"}`);
}
