
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
    if (typeof query !== "string" || query.trim().length < 2) {
        throw new Error("A search query is required.");
    }

    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
        throw new Error("TAVILY_API_KEY is not configured.");
    }

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            api_key: apiKey,
            query: query.trim(),
            search_depth: "advanced",
            topic: "general",
            max_results: Math.min(Math.max(maxResults, 1), 10),
            include_answer: true,
            include_raw_content: false
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.detail || data?.message || "Web search failed."
        );
    }

    return {
        ok: true,
        query: data.query,
        answer: data.answer || null,
        results: (data.results || []).map(result => ({
            title: result.title,
            url: result.url,
            content: result.content,
            publishedDate: result.published_date || null
        }))
    };
}
