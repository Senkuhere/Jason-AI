import { spawn } from "node:child_process";

export function calculator(expression) {
    if (typeof expression !== "string" || expression.trim() === "") {
        throw new Error("A mathematical expression is required.");
    }

    const normalizedExpression = expression.replace(/\s+/g, "");

    if (!/^[0-9.+\-*/%()]+$/.test(normalizedExpression)) {
        throw new Error(
            "Only numbers and arithmetic operators are allowed."
        );
    }

    const result = Function(
        `"use strict"; return (${normalizedExpression});`
    )();

    if (!Number.isFinite(result)) {
        throw new Error("The calculation did not produce a finite number.");
    }

    return result;
}

// Get the current date and time in the user's timezone
export function getCurrentDate() {
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "Asia/Manila"
    }).format(new Date());
}

export async function getWeather(query) {
    if (typeof query !== "string" || query.trim().length < 2) {
        throw new Error("A city or location is required.");
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        throw new Error("OPENWEATHER_API_KEY is not configured.");
    }

    const locationParams = new URLSearchParams({
        q: query.trim(),
        limit: "1",
        appid: apiKey
    });

    const locationResponse = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?${locationParams}`
    );

    const locations = await locationResponse.json();

    if (!locationResponse.ok) {
        throw new Error(
            locations.message || "Location lookup failed."
        );
    }

    if (!Array.isArray(locations) || locations.length === 0) {
        throw new Error(
            `No location found for "${query}". Try including the country.`
        );
    }

    const location = locations[0];

    const weatherParams = new URLSearchParams({
        lat: String(location.lat),
        lon: String(location.lon),
        units: "metric",
        appid: apiKey
    });

    const weatherResponse = await fetch(
        `https://api.openweathermap.org/data/4.0/onecall/current?${weatherParams}`
    );

    const weather = await weatherResponse.json();

    if (!weatherResponse.ok) {
        throw new Error(
            weather.message || "Weather request failed."
        );
    }

    const current = weather.data?.[0];

    if (!current) {
        throw new Error("Current weather data was not returned.");
    }

    const formatTime = (timestamp) =>
        timestamp
            ? new Intl.DateTimeFormat("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: weather.timezone || "Asia/Manila"
            }).format(new Date(timestamp * 1000))
            : null;

    return {
    ok: true,
    currentTime: formatTime(current.dt),
    location: `${location.name}, ${location.country}`,
    timezone: weather.timezone,
    temperatureCelsius: current.temp,
    feelsLikeCelsius: current.feels_like,
    condition: current.weather?.[0]?.description || "Unknown",
    humidityPercent: current.humidity,
    cloudinessPercent: current.clouds,
    windSpeedMetersPerSecond: current.wind_speed,
    sunrise: formatTime(current.sunrise),
    sunset: formatTime(current.sunset),
    
    };
}
export async function searchWeb(query, maxResults = 5) {
    if (
        typeof query !== "string" ||
        query.trim().length < 2
    ) {
        throw new Error("A search query is required.");
    }

    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
        throw new Error(
            "TAVILY_API_KEY is not configured."
        );
    }

    const safeMaxResults = Number.isFinite(Number(maxResults))
        ? Math.min(Math.max(Number(maxResults), 1), 10)
        : 5;

    const response = await fetch(
        "https://api.tavily.com/search",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: query.trim(),
                search_depth: "basic",
                topic: "general",
                max_results: safeMaxResults,
                include_answer: true,
                include_raw_content: false
            }),
            signal: AbortSignal.timeout(15000)
        }
    );

    const rawBody = await response.text();

    let data;

    try {
        data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
        data = {
            message: rawBody
        };
    }

    if (!response.ok) {
        const errorDetails =
            typeof data.detail === "string"
                ? data.detail
                : data.detail
                    ? JSON.stringify(data.detail)
                    : data.message || "Unknown Tavily error.";

        throw new Error(
            `Tavily returned ${response.status}: ${errorDetails}`
        );
    }

    return {
        ok: true,
        query: data.query,
        answer: data.answer || null,
        results: (data.results || []).map(result => ({
            title: result.title,
            url: result.url,
            content: String(result.content || "").slice(0, 400),
            publishedDate: result.published_date || null
        }))
    };
}

export function openWebPage(url) {
    if (typeof url !== "string" || url.trim() === "") {
        throw new Error("A webpage URL is required.");
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(url.trim());
    } catch {
        throw new Error("The webpage URL is invalid.");
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only http and https URLs can be opened.");
    }

    const safeUrl = parsedUrl.href;

    if (process.platform === "win32") {
        spawn("cmd.exe", ["/c", "start", "", safeUrl], {
            detached: true,
            stdio: "ignore"
        }).unref();
    } else if (process.platform === "darwin") {
        spawn("open", [safeUrl], {
            detached: true,
            stdio: "ignore"
        }).unref();
    } else {
        spawn("xdg-open", [safeUrl], {
            detached: true,
            stdio: "ignore"
        }).unref();
    }

    return {
        ok: true,
        url: safeUrl,
        message: "The webpage was opened in the default browser."
    };
}

export async function searchAndOpen(query, site) {
    if (typeof query !== "string" || query.trim().length < 2) {
        throw new Error("A search query is required.");
    }
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not configured.");

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            api_key: apiKey,
            query: query.trim(),
            search_depth: "basic",
            max_results: 3,
            include_answer: false,
            ...(site ? { include_domains: [site] } : {})
        }),
        signal: AbortSignal.timeout(8000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Tavily returned ${response.status}: ${data.detail?.error || data.message || "Unknown error"}`);
    }

    const top = (data.results || []).find(r => /^https?:\/\//i.test(r.url));
    if (!top) throw new Error(`No result found for "${query}".`);

    openWebPage(top.url);
    return { ok: true, url: top.url, title: top.title };
}