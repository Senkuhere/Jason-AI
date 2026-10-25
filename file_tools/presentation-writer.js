// presentation-writer.js
//
// This is the content/design-director step. Gemini creates a semantic JSON
// blueprint, while render-pptx.js remains responsible for all drawing. This is
// the same separation used by Jason's Word/PDF document pipeline.

import { GoogleGenAI } from "@google/genai";

import { normalizePresentationSpec, SLIDE_TYPES } from "./presentation-spec.js";
import { presentationThemeNames } from "./presentation-themes.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_PRESENTATION_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const WRITE_TIMEOUT_MS = 150_000;

const KIND_GUIDE = {
    pitch: "Persuade the audience: problem, insight, proposed solution, value, evidence, plan and a clear ask.",
    lesson: "Teach progressively: objectives, essential ideas, examples, recap and a final check or discussion prompt.",
    report: "Explain findings clearly: context, method or basis, findings, interpretation, recommendations and conclusion.",
    proposal: "Make a practical case: need, objectives, approach, timeline, resources, benefits, risks and next steps.",
    training: "Support action: goals, concepts, demonstrated process, examples, practice, checklist and recap.",
    portfolio: "Tell a visual story: introduction, selected work or milestones, outcomes, reflection and closing.",
    general: "Choose the clearest narrative for the purpose and audience."
};

export function presentationKinds() {
    return Object.keys(KIND_GUIDE);
}

function clampSlideCount(value) {
    const count = Math.round(Number(value) || 8);
    return Math.min(Math.max(count, 3), 20);
}

const BLUEPRINT_SHAPE = `
Return ONE JSON object only, with no markdown fences:
{
  "title": "presentation title",
  "subtitle": "optional subtitle",
  "author": "author if supplied",
  "audience": "intended audience",
  "theme": "one of: ${presentationThemeNames().join(", ")}",
  "slides": [
    {
      "type": "one of: ${SLIDE_TYPES.join(", ")}",
      "eyebrow": "optional short category label",
      "title": "short slide title",
      "subtitle": "optional supporting line",
      "body": "optional short paragraph",
      "bullets": ["short point", "short point"],
      "left": { "title": "", "body": "", "bullets": [] },
      "right": { "title": "", "body": "", "bullets": [] },
      "items": [
        { "title": "step/card title", "text": "short explanation", "value": "optional KPI", "label": "optional date or label" }
      ],
      "quote": "quote text, for quote slides only",
      "attribution": "source or speaker",
      "chart": {
        "type": "bar, column, line, pie or doughnut",
        "categories": ["A", "B"],
        "series": [{ "name": "Series", "values": [10, 20] }]
      },
      "notes": "optional concise speaker notes"
    }
  ],
  "notesForUser": "anything the user must verify, otherwise empty"
}`;

function buildInstructions({ kind, slideCount, language, requestedTheme, tone, designDirection, hasSources }) {
    return `
You are an expert presentation writer and art director. Create a presentation that is ready to present, not a document broken into slides.

Purpose: ${KIND_GUIDE[kind] || KIND_GUIDE.general}
Target slide count: ${slideCount} slides, including title and closing slides.
Language: ${language || "English"}.
Tone: ${tone || "clear, confident and appropriate for the audience"}.
Theme: ${requestedTheme || `choose the best from ${presentationThemeNames().join(", ")}`}.
Design direction from the user: ${designDirection || "none; use good professional judgement"}.

Narrative and content rules:
- Build one coherent story. Each slide must have one clear purpose and lead naturally to the next.
- Use a title slide first and a useful closing slide last. Do not make the closing merely say “Thank you”.
- Prefer 3–5 concise bullets; never exceed 6. Bullets should generally be under 14 words.
- Avoid paragraphs unless a short explanation is genuinely clearer than bullets.
- Vary layouts intentionally. Do not use content on every slide.
- Use two_column or comparison for meaningful contrasts, process for ordered steps, timeline for dated stages,
  kpi only for real supplied metrics, chart only for real supplied numeric data, and quote only for a real supplied quote.
- Use items for process, timeline and KPI cards. For a timeline, put the date/phase in label.
- Put delivery guidance and useful detail in notes, not on the visible slide.
- Do not mention layout, colours, fonts, coordinates or decorative shapes in slide text.

Honesty rules:
- Never invent statistics, research, survey results, quotations, dates, customers or sources.
- ${hasSources
        ? "Treat the user's supplied material as the factual source. Preserve important numbers accurately."
        : "Use only reliable general knowledge. Do not create charts or KPI values without supplied numerical data."}
- If essential information is missing, use a clearly marked placeholder only when necessary and explain it in notesForUser.

${BLUEPRINT_SHAPE}`;
}

function parseJson(text) {
    const cleaned = String(text || "").trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The writer did not return a presentation.");
    return JSON.parse(cleaned.slice(start, end + 1));
}

export async function writePresentationBlueprint({
    kind = "general", title, brief, content, theme, slideCount, audience,
    tone, author, language, designDirection
} = {}) {
    const chosenKind = presentationKinds().includes(String(kind).toLowerCase())
        ? String(kind).toLowerCase()
        : "general";
    const count = clampSlideCount(slideCount);
    const instructions = buildInstructions({
        kind: chosenKind,
        slideCount: count,
        language,
        requestedTheme: theme,
        tone,
        designDirection,
        hasSources: Boolean(content && String(content).trim())
    });
    const request = [
        title ? `Requested title: ${title}` : "",
        audience ? `Audience: ${audience}` : "",
        `What the presentation is about and what it must accomplish:\n${brief}`,
        content ? `Facts, source material and numbers supplied by the user:\n${content}` : "",
        author ? `Presenter/author: ${author}` : ""
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
                        maxOutputTokens: 18_000,
                        thinkingConfig: {
                            thinkingLevel: process.env.GEMINI_PRESENTATION_THINKING || "LOW"
                        }
                    }
                }),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error("Writing the presentation took too long.")),
                    WRITE_TIMEOUT_MS
                ))
            ]);

            return normalizePresentationSpec(parseJson(response.text), {
                title, author, audience, theme
            });
        } catch (error) {
            lastError = error;
            if (attempt === 2) break;
        }
    }

    throw new Error(`The presentation could not be written: ${lastError?.message || "unknown problem"}`);
}
