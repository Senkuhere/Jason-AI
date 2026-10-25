// presentation-themes.js
//
// This file controls how Jason's presentations LOOK.  The AI never chooses
// coordinates or raw colours; it only chooses a theme and semantic layouts.
// Keeping visual decisions here prevents malformed AI output from producing
// overlapping, inconsistent slides.

export const PRESENTATION_THEMES = {
    executive: {
        label: "Executive Blue",
        description: "Professional reports, proposals, plans and business presentations",
        fonts: { heading: "Aptos Display", body: "Aptos" },
        colors: {
            background: "F5F8FC",
            surface: "FFFFFF",
            primary: "102A43",
            secondary: "486581",
            accent: "2F80ED",
            accent2: "56CCF2",
            text: "16212E",
            muted: "627D98",
            line: "D9E2EC",
            onDark: "FFFFFF",
            positive: "219653"
        }
    },

    midnight: {
        label: "Midnight Technology",
        description: "Technology, AI, engineering and futuristic topics",
        fonts: { heading: "Aptos Display", body: "Aptos" },
        colors: {
            background: "08111F",
            surface: "111E31",
            primary: "050A12",
            secondary: "162A46",
            accent: "42C2FF",
            accent2: "7B61FF",
            text: "F2F7FC",
            muted: "A9BAD0",
            line: "29405F",
            onDark: "FFFFFF",
            positive: "52D6A5"
        }
    },

    aurora: {
        label: "Aurora",
        description: "Modern, imaginative and creative presentations",
        fonts: { heading: "Aptos Display", body: "Aptos" },
        colors: {
            background: "F7F5FF",
            surface: "FFFFFF",
            primary: "33206A",
            secondary: "65558F",
            accent: "7357FF",
            accent2: "16B8A6",
            text: "211A35",
            muted: "746C85",
            line: "E4DFF2",
            onDark: "FFFFFF",
            positive: "138A79"
        }
    },

    warm: {
        label: "Warm Editorial",
        description: "Human-centred stories, portfolios, culture and creative pitches",
        fonts: { heading: "Georgia", body: "Aptos" },
        colors: {
            background: "FFF9F1",
            surface: "FFFFFF",
            primary: "512E25",
            secondary: "835C50",
            accent: "E76F51",
            accent2: "E9C46A",
            text: "332621",
            muted: "806D65",
            line: "EADDD4",
            onDark: "FFFFFF",
            positive: "4F7D62"
        }
    },

    minimal: {
        label: "Minimal Monochrome",
        description: "Clean academic, informational and understated presentations",
        fonts: { heading: "Arial", body: "Arial" },
        colors: {
            background: "F7F7F5",
            surface: "FFFFFF",
            primary: "171717",
            secondary: "525252",
            accent: "171717",
            accent2: "A3A3A3",
            text: "171717",
            muted: "6B6B6B",
            line: "DDDDDA",
            onDark: "FFFFFF",
            positive: "287A52"
        }
    }
};

export function presentationThemeNames() {
    return Object.keys(PRESENTATION_THEMES);
}

export function getPresentationTheme(name) {
    return PRESENTATION_THEMES[String(name || "").toLowerCase()] || PRESENTATION_THEMES.executive;
}
