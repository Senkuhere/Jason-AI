// render-pptx.js
//
// Converts a validated semantic blueprint into a widescreen PowerPoint file.
// Every layout is drawn with native PowerPoint text, shapes and charts, so the
// result remains editable and does not depend on downloaded images.

import pptxgen from "pptxgenjs";

import { getPresentationTheme } from "./presentation-themes.js";

const WIDTH = 13.333;
const HEIGHT = 7.5;
const MARGIN_X = 0.72;

function addShape(slide, pptx, type, options) {
    slide.addShape(pptx.ShapeType[type], options);
}

function addText(slide, text, options = {}) {
    if (!String(text || "").trim()) return;
    slide.addText(String(text), {
        margin: 0,
        breakLine: false,
        valign: "mid",
        fit: "shrink",
        ...options
    });
}

function addBackground(slide, pptx, color) {
    addShape(slide, pptx, "rect", {
        x: 0, y: 0, w: WIDTH, h: HEIGHT,
        line: { color, transparency: 100 },
        fill: { color }
    });
}

function addDecor(slide, pptx, theme, variant = "normal") {
    const c = theme.colors;

    if (variant === "dark") {
        addShape(slide, pptx, "ellipse", {
            x: 10.7, y: -1.35, w: 4.1, h: 4.1,
            line: { transparency: 100 },
            fill: { color: c.accent, transparency: 78 }
        });
        addShape(slide, pptx, "ellipse", {
            x: 11.35, y: 5.75, w: 2.4, h: 2.4,
            line: { transparency: 100 },
            fill: { color: c.accent2, transparency: 72 }
        });
        return;
    }

    addShape(slide, pptx, "rect", {
        x: 0, y: 0, w: 0.12, h: HEIGHT,
        line: { transparency: 100 }, fill: { color: c.accent }
    });
    addShape(slide, pptx, "ellipse", {
        x: 11.95, y: 0.32, w: 0.72, h: 0.72,
        line: { color: c.accent, transparency: 35, width: 1.5 },
        fill: { color: c.background, transparency: 100 }
    });
}

function addHeader(slide, pptx, theme, item, slideNumber) {
    const c = theme.colors;
    addBackground(slide, pptx, c.background);
    addDecor(slide, pptx, theme);

    if (item.eyebrow) {
        addText(slide, item.eyebrow.toUpperCase(), {
            x: MARGIN_X, y: 0.34, w: 5.8, h: 0.25,
            fontFace: theme.fonts.body, fontSize: 9.5,
            bold: true, charSpacing: 1.5, color: c.accent
        });
    }

    addText(slide, item.title, {
        x: MARGIN_X, y: item.eyebrow ? 0.68 : 0.45, w: 11.5, h: 0.62,
        fontFace: theme.fonts.heading, fontSize: 27,
        bold: true, color: c.text
    });
    addShape(slide, pptx, "line", {
        x: MARGIN_X, y: 1.36, w: 11.85, h: 0,
        line: { color: c.line, width: 1 }
    });
    addText(slide, String(slideNumber).padStart(2, "0"), {
        x: 12.05, y: 7.05, w: 0.55, h: 0.2,
        fontFace: theme.fonts.body, fontSize: 8.5,
        color: c.muted, align: "right"
    });
}

function addBullets(slide, pptx, theme, bullets, { x, y, w, h, fontSize = 18 } = {}) {
    if (!bullets.length) return;
    const c = theme.colors;
    const rowHeight = Math.min(0.78, h / bullets.length);

    bullets.forEach((bullet, index) => {
        const top = y + index * rowHeight;
        addShape(slide, pptx, "ellipse", {
            x, y: top + 0.18, w: 0.12, h: 0.12,
            line: { transparency: 100 }, fill: { color: index % 2 ? c.accent2 : c.accent }
        });
        addText(slide, bullet, {
            x: x + 0.27, y: top, w: w - 0.27, h: rowHeight - 0.04,
            fontFace: theme.fonts.body, fontSize,
            color: c.text, valign: "top", breakLine: true
        });
    });
}

function addBodyAndBullets(slide, pptx, theme, item, bounds) {
    const bodyHeight = item.body ? Math.min(1.3, bounds.h * 0.32) : 0;
    if (item.body) {
        addText(slide, item.body, {
            x: bounds.x, y: bounds.y, w: bounds.w, h: bodyHeight,
            fontFace: theme.fonts.body, fontSize: 17,
            color: theme.colors.secondary, valign: "top", breakLine: true,
            lineSpacingMultiple: 1.05
        });
    }
    addBullets(slide, pptx, theme, item.bullets, {
        x: bounds.x,
        y: bounds.y + bodyHeight + (bodyHeight ? 0.18 : 0),
        w: bounds.w,
        h: bounds.h - bodyHeight - (bodyHeight ? 0.18 : 0),
        fontSize: 18
    });
}

function renderTitle(slide, pptx, theme, item, spec) {
    const c = theme.colors;
    addBackground(slide, pptx, c.primary);
    addDecor(slide, pptx, theme, "dark");
    addShape(slide, pptx, "rect", {
        x: 0.72, y: 1.13, w: 0.11, h: 4.65,
        line: { transparency: 100 }, fill: { color: c.accent }
    });

    if (item.eyebrow) {
        addText(slide, item.eyebrow.toUpperCase(), {
            x: 1.12, y: 1.23, w: 7.2, h: 0.35,
            fontFace: theme.fonts.body, fontSize: 11,
            bold: true, charSpacing: 2, color: c.accent2
        });
    }
    addText(slide, item.title || spec.title, {
        x: 1.1, y: 1.65, w: 9.65, h: 2.15,
        fontFace: theme.fonts.heading, fontSize: 34,
        bold: true, color: c.onDark, valign: "mid",
        breakLine: true, paraSpaceAfterPt: 8
    });
    addText(slide, item.subtitle || spec.subtitle, {
        x: 1.12, y: 4.02, w: 8.8, h: 0.9,
        fontFace: theme.fonts.body, fontSize: 18,
        color: "DCE7F3", valign: "top", breakLine: true
    });
    addText(slide, spec.author, {
        x: 1.12, y: 5.55, w: 6.8, h: 0.34,
        fontFace: theme.fonts.body, fontSize: 11.5,
        color: c.accent2
    });
}

function renderSection(slide, pptx, theme, item, number) {
    const c = theme.colors;
    addBackground(slide, pptx, c.primary);
    addDecor(slide, pptx, theme, "dark");
    addText(slide, String(number).padStart(2, "0"), {
        x: 0.85, y: 0.73, w: 2.2, h: 1.3,
        fontFace: theme.fonts.heading, fontSize: 55,
        bold: true, color: c.accent
    });
    addShape(slide, pptx, "line", {
        x: 0.9, y: 2.1, w: 1.25, h: 0,
        line: { color: c.accent2, width: 4 }
    });
    addText(slide, item.title, {
        x: 3.05, y: 1.53, w: 8.8, h: 1.75,
        fontFace: theme.fonts.heading, fontSize: 34,
        bold: true, color: c.onDark, breakLine: true
    });
    addText(slide, item.subtitle || item.body, {
        x: 3.08, y: 3.5, w: 7.9, h: 1.1,
        fontFace: theme.fonts.body, fontSize: 18,
        color: "DCE7F3", valign: "top", breakLine: true
    });
}

function renderContent(slide, pptx, theme, item, number) {
    addHeader(slide, pptx, theme, item, number);
    addBodyAndBullets(slide, pptx, theme, item, {
        x: 0.9, y: 1.73, w: 8.4, h: 4.75
    });

    // A purely native visual anchor keeps ordinary content slides from looking
    // like an unstyled title-and-bullets template.
    const c = theme.colors;
    addShape(slide, pptx, "roundRect", {
        x: 9.82, y: 1.82, w: 2.55, h: 4.35,
        rectRadius: 0.08,
        line: { color: c.line, width: 1 },
        fill: { color: c.surface }
    });
    addText(slide, item.eyebrow || "KEY IDEA", {
        x: 10.15, y: 2.22, w: 1.9, h: 0.3,
        fontFace: theme.fonts.body, fontSize: 9,
        bold: true, color: c.accent, align: "center", charSpacing: 1
    });
    addText(slide, item.subtitle || item.title, {
        x: 10.08, y: 2.72, w: 2.05, h: 2.1,
        fontFace: theme.fonts.heading, fontSize: 21,
        bold: true, color: c.text, align: "center",
        breakLine: true
    });
    addShape(slide, pptx, "line", {
        x: 10.57, y: 5.33, w: 1.05, h: 0,
        line: { color: c.accent2, width: 4 }
    });
}

function addColumnCard(slide, pptx, theme, column, x, accent, label) {
    const c = theme.colors;
    addShape(slide, pptx, "roundRect", {
        x, y: 1.78, w: 5.65, h: 4.85,
        rectRadius: 0.07,
        line: { color: c.line, width: 1 }, fill: { color: c.surface },
        shadow: { type: "outer", color: "000000", opacity: 0.12, blur: 1.5, angle: 45, distance: 1 }
    });
    addShape(slide, pptx, "rect", {
        x, y: 1.78, w: 5.65, h: 0.11,
        line: { transparency: 100 }, fill: { color: accent }
    });
    addText(slide, label, {
        x: x + 0.4, y: 2.08, w: 1.4, h: 0.25,
        fontFace: theme.fonts.body, fontSize: 9,
        bold: true, color: accent, charSpacing: 1.2
    });
    addText(slide, column.title, {
        x: x + 0.4, y: 2.42, w: 4.85, h: 0.65,
        fontFace: theme.fonts.heading, fontSize: 21,
        bold: true, color: c.text
    });
    if (column.body) {
        addText(slide, column.body, {
            x: x + 0.4, y: 3.18, w: 4.8, h: 1.05,
            fontFace: theme.fonts.body, fontSize: 14.5,
            color: c.secondary, valign: "top", breakLine: true
        });
    }
    addBullets(slide, pptx, theme, column.bullets, {
        x: x + 0.4, y: column.body ? 4.35 : 3.3,
        w: 4.8, h: column.body ? 1.85 : 2.85, fontSize: 14
    });
}

function renderColumns(slide, pptx, theme, item, number, comparison = false) {
    addHeader(slide, pptx, theme, item, number);
    addColumnCard(slide, pptx, theme, item.left, 0.73, theme.colors.accent, comparison ? "OPTION A" : "01");
    addColumnCard(slide, pptx, theme, item.right, 6.93, theme.colors.accent2, comparison ? "OPTION B" : "02");
}

function renderCards(slide, pptx, theme, item, number, mode) {
    addHeader(slide, pptx, theme, item, number);
    const c = theme.colors;
    const items = item.items.slice(0, mode === "kpi" ? 4 : 5);
    const gap = 0.2;
    const cardWidth = (11.85 - gap * (items.length - 1)) / items.length;
    const y = mode === "kpi" ? 2.12 : 2.22;
    const h = mode === "kpi" ? 3.55 : 3.75;

    if (mode === "timeline") {
        addShape(slide, pptx, "line", {
            x: 1.05, y: 3.05, w: 11.08, h: 0,
            line: { color: c.line, width: 3 }
        });
    }

    items.forEach((entry, index) => {
        const x = 0.75 + index * (cardWidth + gap);
        const accent = index % 2 ? c.accent2 : c.accent;

        if (mode === "timeline") {
            addShape(slide, pptx, "ellipse", {
                x: x + cardWidth / 2 - 0.11, y: 2.94, w: 0.22, h: 0.22,
                line: { color: c.background, width: 1 }, fill: { color: accent }
            });
        }

        addShape(slide, pptx, "roundRect", {
            x, y: mode === "timeline" ? 3.38 : y, w: cardWidth, h: mode === "timeline" ? 2.32 : h,
            rectRadius: 0.06,
            line: { color: c.line, width: 1 }, fill: { color: c.surface }
        });
        addText(slide, mode === "kpi" ? (entry.value || String(index + 1).padStart(2, "0")) :
            (entry.label || String(index + 1).padStart(2, "0")), {
            x: x + 0.2, y: mode === "timeline" ? 3.65 : y + 0.28,
            w: cardWidth - 0.4, h: mode === "kpi" ? 0.85 : 0.4,
            fontFace: theme.fonts.heading,
            fontSize: mode === "kpi" ? 27 : 11,
            bold: true, color: accent, align: mode === "kpi" ? "center" : "left"
        });
        addText(slide, entry.title || entry.label, {
            x: x + 0.2, y: mode === "timeline" ? 4.12 : (mode === "kpi" ? 3.35 : y + 0.95),
            w: cardWidth - 0.4, h: 0.65,
            fontFace: theme.fonts.heading, fontSize: mode === "kpi" ? 15 : 16,
            bold: true, color: c.text, align: mode === "kpi" ? "center" : "left",
            breakLine: true
        });
        addText(slide, entry.text, {
            x: x + 0.2, y: mode === "timeline" ? 4.77 : (mode === "kpi" ? 4.18 : y + 1.78),
            w: cardWidth - 0.4, h: mode === "timeline" ? 0.64 : 1.3,
            fontFace: theme.fonts.body, fontSize: mode === "kpi" ? 12.5 : 12,
            color: c.muted, align: mode === "kpi" ? "center" : "left",
            valign: "top", breakLine: true
        });

        if (mode === "process" && index < items.length - 1) {
            addText(slide, "›", {
                x: x + cardWidth - 0.01, y: 3.6, w: gap + 0.03, h: 0.45,
                fontFace: "Arial", fontSize: 25, bold: true,
                color: c.accent, align: "center"
            });
        }
    });
}

function renderChart(slide, pptx, theme, item, number) {
    addHeader(slide, pptx, theme, item, number);
    const c = theme.colors;
    const chart = item.chart;
    const data = chart.series.map(series => ({
        name: series.name,
        labels: chart.categories,
        values: series.values
    }));
    const type = chart.type === "column" ? pptx.ChartType.bar : pptx.ChartType[chart.type];
    const circular = chart.type === "pie" || chart.type === "doughnut";

    slide.addChart(type, data, {
        x: 0.82, y: 1.74, w: item.body ? 8.35 : 11.7, h: 4.95,
        catAxisLabelFontFace: theme.fonts.body,
        catAxisLabelFontSize: 10,
        valAxisLabelFontFace: theme.fonts.body,
        valAxisLabelFontSize: 9,
        showLegend: chart.series.length > 1 || circular,
        legendFontFace: theme.fonts.body,
        legendFontSize: 10,
        legendPos: circular ? "r" : "b",
        showTitle: false,
        showLabel: circular,
        showPercent: circular,
        chartColors: [c.accent, c.accent2, c.secondary, c.positive],
        showValue: false,
        showValAxisTitle: false,
        showCatAxisTitle: false,
        valAxisHidden: circular,
        catAxisHidden: circular,
        valGridLine: { color: c.line, width: 1 },
        catAxisLineColor: c.line,
        valAxisLineColor: c.line,
        chartArea: { border: { color: c.background, transparency: 100 }, fill: { color: c.background, transparency: 100 } },
        plotArea: { border: { color: c.background, transparency: 100 }, fill: { color: c.background, transparency: 100 } },
        holeSize: chart.type === "doughnut" ? 58 : undefined,
        barDir: chart.type === "bar" ? "bar" : "col",
        grouping: chart.type === "line" ? undefined : "clustered"
    });

    if (item.body) {
        addShape(slide, pptx, "roundRect", {
            x: 9.55, y: 2.0, w: 2.75, h: 3.9,
            rectRadius: 0.06, line: { color: c.line }, fill: { color: c.surface }
        });
        addText(slide, "INTERPRETATION", {
            x: 9.92, y: 2.35, w: 2.0, h: 0.28,
            fontFace: theme.fonts.body, fontSize: 9,
            bold: true, color: c.accent, charSpacing: 1
        });
        addText(slide, item.body, {
            x: 9.92, y: 2.85, w: 2.0, h: 2.45,
            fontFace: theme.fonts.body, fontSize: 14.5,
            color: c.text, valign: "top", breakLine: true
        });
    }
}

function renderQuote(slide, pptx, theme, item, number) {
    const c = theme.colors;
    addBackground(slide, pptx, c.primary);
    addDecor(slide, pptx, theme, "dark");
    addText(slide, "“", {
        x: 0.83, y: 0.75, w: 1.25, h: 1.1,
        fontFace: "Georgia", fontSize: 64, bold: true, color: c.accent
    });
    addText(slide, item.quote, {
        x: 1.42, y: 1.55, w: 10.35, h: 3.25,
        fontFace: theme.fonts.heading, fontSize: 28,
        bold: false, italic: true, color: c.onDark,
        align: "center", breakLine: true
    });
    addShape(slide, pptx, "line", {
        x: 5.58, y: 5.08, w: 2.15, h: 0,
        line: { color: c.accent2, width: 3 }
    });
    addText(slide, item.attribution, {
        x: 3.0, y: 5.35, w: 7.3, h: 0.45,
        fontFace: theme.fonts.body, fontSize: 13,
        color: "DCE7F3", align: "center"
    });
    addText(slide, String(number).padStart(2, "0"), {
        x: 12.05, y: 7.05, w: 0.55, h: 0.2,
        fontFace: theme.fonts.body, fontSize: 8.5,
        color: "A9BAD0", align: "right"
    });
}

function renderClosing(slide, pptx, theme, item, spec) {
    const c = theme.colors;
    addBackground(slide, pptx, c.primary);
    addDecor(slide, pptx, theme, "dark");
    addText(slide, item.eyebrow || "NEXT STEP", {
        x: 1.0, y: 1.17, w: 4.5, h: 0.35,
        fontFace: theme.fonts.body, fontSize: 10.5,
        bold: true, charSpacing: 1.8, color: c.accent2
    });
    addText(slide, item.title || "Move forward with clarity", {
        x: 1.0, y: 1.7, w: 9.6, h: 1.45,
        fontFace: theme.fonts.heading, fontSize: 35,
        bold: true, color: c.onDark, breakLine: true
    });
    addText(slide, item.subtitle || item.body, {
        x: 1.02, y: 3.38, w: 8.2, h: 0.9,
        fontFace: theme.fonts.body, fontSize: 18,
        color: "DCE7F3", valign: "top", breakLine: true
    });
    addBullets(slide, pptx, {
        ...theme,
        colors: { ...c, text: c.onDark }
    }, item.bullets.slice(0, 3), {
        x: 1.03, y: 4.48, w: 7.6, h: 1.65, fontSize: 16
    });
    addText(slide, spec.author, {
        x: 1.02, y: 6.55, w: 6.0, h: 0.3,
        fontFace: theme.fonts.body, fontSize: 10.5, color: c.accent2
    });
}

function renderSlide(slide, pptx, theme, item, spec, index) {
    const number = index + 1;
    switch (item.type) {
        case "title": return renderTitle(slide, pptx, theme, item, spec);
        case "section": return renderSection(slide, pptx, theme, item, number);
        case "two_column": return renderColumns(slide, pptx, theme, item, number, false);
        case "comparison": return renderColumns(slide, pptx, theme, item, number, true);
        case "process": return renderCards(slide, pptx, theme, item, number, "process");
        case "timeline": return renderCards(slide, pptx, theme, item, number, "timeline");
        case "kpi": return renderCards(slide, pptx, theme, item, number, "kpi");
        case "chart": return renderChart(slide, pptx, theme, item, number);
        case "quote": return renderQuote(slide, pptx, theme, item, number);
        case "closing": return renderClosing(slide, pptx, theme, item, spec);
        default: return renderContent(slide, pptx, theme, item, number);
    }
}

export async function renderPptx(spec, { outputPath } = {}) {
    if (!outputPath) throw new Error("An output path is required to render a presentation.");

    const pptx = new pptxgen();
    const theme = getPresentationTheme(spec.theme);

    pptx.layout = "LAYOUT_WIDE";
    pptx.author = spec.author || "Jason AI";
    pptx.company = "Jason AI";
    pptx.subject = `Presentation for ${spec.audience || "the requested audience"}`;
    pptx.title = spec.title;
    pptx.lang = "en-US";
    pptx.theme = {
        headFontFace: theme.fonts.heading,
        bodyFontFace: theme.fonts.body,
        lang: "en-US"
    };

    spec.slides.forEach((item, index) => {
        const slide = pptx.addSlide();
        renderSlide(slide, pptx, theme, item, spec, index);
        if (item.notes) slide.addNotes(item.notes);
    });

    await pptx.writeFile({ fileName: outputPath, compression: true });
}
