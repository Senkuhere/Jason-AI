// presentation-spec.js
//
// Gemini writes a semantic presentation blueprint.  This module cleans that
// blueprint and places strict limits on every field before the renderer sees
// it.  The limits are intentional: concise content is one of the main things
// that separates a presentable slide deck from a document pasted into slides.

import { presentationThemeNames } from "./presentation-themes.js";

export const SLIDE_TYPES = [
    "title", "section", "content", "two_column", "comparison",
    "process", "timeline", "kpi", "chart", "quote", "closing"
];

const CHART_TYPES = ["bar", "column", "line", "pie", "doughnut"];
const MAX_SLIDES = 24;

function cleanText(value, max = 500) {
    return String(value ?? "")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}

function cleanList(value, { maximum = 6, itemLength = 180 } = {}) {
    return (Array.isArray(value) ? value : [])
        .map(item => cleanText(item, itemLength))
        .filter(Boolean)
        .slice(0, maximum);
}

function cleanItems(value, maximum = 6) {
    return (Array.isArray(value) ? value : [])
        .filter(item => item && typeof item === "object")
        .map(item => ({
            title: cleanText(item.title, 80),
            text: cleanText(item.text, 180),
            value: cleanText(item.value, 40),
            label: cleanText(item.label, 60)
        }))
        .filter(item => item.title || item.text || item.value || item.label)
        .slice(0, maximum);
}

function cleanColumn(value) {
    const column = value && typeof value === "object" ? value : {};
    return {
        title: cleanText(column.title, 80),
        body: cleanText(column.body, 420),
        bullets: cleanList(column.bullets, { maximum: 5, itemLength: 150 })
    };
}

function cleanChart(value) {
    if (!value || typeof value !== "object") return null;

    const type = CHART_TYPES.includes(String(value.type || "").toLowerCase())
        ? String(value.type).toLowerCase()
        : "column";
    const categories = cleanList(value.categories, { maximum: 8, itemLength: 35 });
    const series = (Array.isArray(value.series) ? value.series : [])
        .filter(item => item && typeof item === "object")
        .map(item => ({
            name: cleanText(item.name, 50) || "Series",
            values: (Array.isArray(item.values) ? item.values : [])
                .slice(0, categories.length)
                .map(number => Number.isFinite(Number(number)) ? Number(number) : 0)
        }))
        .filter(item => item.values.length === categories.length)
        .slice(0, type === "pie" || type === "doughnut" ? 1 : 4);

    return categories.length >= 2 && series.length
        ? { type, categories, series }
        : null;
}

function inferType(raw, index) {
    const requested = String(raw?.type || "").toLowerCase();
    if (SLIDE_TYPES.includes(requested)) return requested;
    if (index === 0) return "title";
    if (raw?.chart) return "chart";
    if (raw?.quote) return "quote";
    if (Array.isArray(raw?.items) && raw.items.length) return "kpi";
    return "content";
}

function normalizeSlide(raw, index) {
    if (!raw || typeof raw !== "object") return null;

    const slide = {
        type: inferType(raw, index),
        eyebrow: cleanText(raw.eyebrow, 45),
        title: cleanText(raw.title, 110),
        subtitle: cleanText(raw.subtitle, 220),
        body: cleanText(raw.body, 700),
        bullets: cleanList(raw.bullets),
        left: cleanColumn(raw.left),
        right: cleanColumn(raw.right),
        items: cleanItems(raw.items),
        quote: cleanText(raw.quote, 420),
        attribution: cleanText(raw.attribution, 100),
        chart: cleanChart(raw.chart),
        notes: cleanText(raw.notes, 1800)
    };

    // Repair common AI mismatches instead of allowing an empty specialist layout.
    if (slide.type === "chart" && !slide.chart) slide.type = "content";
    if (["process", "timeline", "kpi"].includes(slide.type) && !slide.items.length) {
        slide.type = "content";
    }
    if (slide.type === "quote" && !slide.quote) slide.type = "content";
    if (["two_column", "comparison"].includes(slide.type)) {
        const hasColumns = slide.left.title || slide.left.body || slide.left.bullets.length ||
            slide.right.title || slide.right.body || slide.right.bullets.length;
        if (!hasColumns) slide.type = "content";
    }

    return slide.title || slide.subtitle || slide.body || slide.bullets.length ||
        slide.items.length || slide.quote || slide.chart ? slide : null;
}

export function normalizePresentationSpec(raw, options = {}) {
    if (!raw || typeof raw !== "object") {
        throw new Error("The presentation blueprint was empty.");
    }

    const slides = (Array.isArray(raw.slides) ? raw.slides : [])
        .slice(0, MAX_SLIDES)
        .map(normalizeSlide)
        .filter(Boolean);

    if (!slides.length) throw new Error("The presentation blueprint had no usable slides.");

    // A presentation should always open as a title slide, even if the model
    // accidentally labels the first slide as normal content.
    slides[0].type = "title";

    const requestedTheme = String(options.theme || raw.theme || "executive").toLowerCase();
    const theme = presentationThemeNames().includes(requestedTheme) ? requestedTheme : "executive";
    const title = cleanText(options.title || raw.title || slides[0].title, 140) || "Untitled Presentation";

    if (!slides[0].title) slides[0].title = title;

    return {
        title,
        subtitle: cleanText(raw.subtitle, 240),
        author: cleanText(options.author || raw.author, 100),
        audience: cleanText(options.audience || raw.audience, 140),
        theme,
        slides,
        notesForUser: cleanText(raw.notesForUser, 600)
    };
}

export function presentationSummary(spec) {
    return {
        slides: spec.slides.length,
        layouts: [...new Set(spec.slides.map(slide => slide.type))],
        charts: spec.slides.filter(slide => slide.chart).length
    };
}
