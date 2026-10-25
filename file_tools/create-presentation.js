// create-presentation.js: the one function Jason calls to create a PowerPoint.
//
// 1. Gemini writes a validated presentation blueprint.
// 2. PptxGenJS renders that blueprint with native, editable graphics.
// 3. The .pptx and a reusable JSON blueprint are saved in the configured folder.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { writePresentationBlueprint, presentationKinds } from "./presentation-writer.js";
import { presentationSummary } from "./presentation-spec.js";
import { presentationThemeNames } from "./presentation-themes.js";
import { renderPptx } from "./render-pptx.js";

const DEFAULT_THEME_FOR_KIND = {
    pitch: "aurora",
    lesson: "minimal",
    report: "executive",
    proposal: "executive",
    training: "executive",
    portfolio: "warm",
    general: "executive"
};

export function presentationsFolder() {
    return process.env.PRESENTATIONS_FOLDER ||
        path.join(os.homedir(), "Documents", "Jason Presentations");
}

function safeName(value) {
    return String(value || "Presentation")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 70) || "Presentation";
}

async function freeBaseName(folder, base) {
    for (let number = 1; number < 200; number++) {
        const candidate = number === 1 ? base : `${base} (${number})`;
        const exists = await fs.access(path.join(folder, `${candidate}.pptx`))
            .then(() => true, () => false);
        if (!exists) return candidate;
    }
    return `${base} ${Date.now()}`;
}

const today = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila"
}).format(new Date());

export async function createPresentation({
    kind, title, brief, content, theme, slideCount, audience,
    tone, author, language, designDirection
} = {}) {
    if (typeof brief !== "string" || brief.trim().length < 5) {
        throw new Error(
            "A description of the presentation is required (topic, purpose and what it should contain)."
        );
    }

    const chosenKind = presentationKinds().includes(String(kind || "").toLowerCase())
        ? String(kind).toLowerCase()
        : "general";
    const requestedTheme = String(theme || "").toLowerCase();
    const chosenTheme = presentationThemeNames().includes(requestedTheme)
        ? requestedTheme
        : DEFAULT_THEME_FOR_KIND[chosenKind];

    const spec = await writePresentationBlueprint({
        kind: chosenKind,
        title,
        brief,
        content,
        theme: chosenTheme,
        slideCount,
        audience,
        tone,
        author,
        language,
        designDirection
    });

    const folder = presentationsFolder();
    await fs.mkdir(folder, { recursive: true });

    const base = await freeBaseName(folder, `${safeName(spec.title)} - ${today()}`);
    const outputPath = path.join(folder, `${base}.pptx`);

    await renderPptx(spec, { outputPath });
    const { size } = await fs.stat(outputPath);

    // The blueprint is useful later when editing/regenerating presentations.
    // Failure to save this optional metadata must not discard a valid PowerPoint.
    try {
        const specFolder = path.join(folder, ".jason_specs");
        await fs.mkdir(specFolder, { recursive: true });
        await fs.writeFile(
            path.join(specFolder, `${base}.json`),
            JSON.stringify({
                kind: chosenKind,
                brief,
                createdAt: new Date().toISOString(),
                spec
            }, null, 2),
            "utf8"
        );
    } catch {
        // The PowerPoint itself is the required output; its blueprint is optional.
    }

    const summary = presentationSummary(spec);
    return {
        ok: true,
        execution: { type: "create_presentation", platform: "windows" },
        title: spec.title,
        kind: chosenKind,
        theme: spec.theme,
        folder,
        file: {
            format: "pptx",
            path: outputPath,
            sizeKB: Math.max(1, Math.round(size / 1024))
        },
        slideCount: summary.slides,
        layouts: summary.layouts,
        charts: summary.charts,
        notesForUser: spec.notesForUser || ""
    };
}
