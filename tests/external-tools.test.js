import test from "node:test";
import assert from "node:assert/strict";

import {
    getWeather,
    searchWeb,
    openWebPage
} from "../utility_tools/utility.js";

test("getWeather returns weather data", async t => {
    const originalKey =
        process.env.OPENWEATHER_API_KEY;

    process.env.OPENWEATHER_API_KEY =
        "test-weather-key";

    t.mock.method(
        globalThis,
        "fetch",
        async url => {
            if (
                url.includes("/geo/1.0/direct")
            ) {
                return {
                    ok: true,
                    json: async () => [
                        {
                            lat: 14.5995,
                            lon: 120.9842,
                            name: "Manila",
                            country: "PH"
                        }
                    ]
                };
            }

            return {
                ok: true,
                json: async () => ({
                    timezone: "Asia/Manila",
                    data: [
                        {
                            dt: 1000,
                            temp: 30,
                            feels_like: 31,
                            weather: [
                                {
                                    description: "clear sky"
                                }
                            ],
                            humidity: 70,
                            clouds: 20,
                            wind_speed: 2,
                            sunrise: 500,
                            sunset: 1500
                        }
                    ]
                })
            };
        }
    );

    try {
        const result = await getWeather("Manila");

        assert.equal(result.ok, true);
        assert.equal(result.location, "Manila, PH");
        assert.equal(result.temperatureCelsius, 30);
        assert.equal(result.condition, "clear sky");
    } finally {
        if (originalKey === undefined) {
            delete process.env.OPENWEATHER_API_KEY;
        } else {
            process.env.OPENWEATHER_API_KEY =
                originalKey;
        }
    }
});

test("getWeather rejects missing API keys", async () => {
    const originalKey =
        process.env.OPENWEATHER_API_KEY;

    delete process.env.OPENWEATHER_API_KEY;

    try {
        await assert.rejects(
            () => getWeather("Manila"),
            {
                message:
                    "OPENWEATHER_API_KEY is not configured."
            }
        );
    } finally {
        if (originalKey !== undefined) {
            process.env.OPENWEATHER_API_KEY =
                originalKey;
        }
    }
});

test("searchWeb returns search results", async t => {
    const originalKey =
        process.env.TAVILY_API_KEY;

    process.env.TAVILY_API_KEY =
        "test-tavily-key";

    t.mock.method(
        globalThis,
        "fetch",
        async () => ({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    query: "Node.js",
                    answer: "Node.js is a JavaScript runtime.",
                    results: [
                        {
                            title: "Node.js",
                            url: "https://nodejs.org",
                            content: "Official Node.js website.",
                            published_date: null
                        }
                    ]
                })
        })
    );

    try {
        const result = await searchWeb("Node.js");

        assert.equal(result.ok, true);
        assert.equal(result.query, "Node.js");
        assert.equal(result.results.length, 1);
        assert.equal(
            result.results[0].title,
            "Node.js"
        );
    } finally {
        if (originalKey === undefined) {
            delete process.env.TAVILY_API_KEY;
        } else {
            process.env.TAVILY_API_KEY =
                originalKey;
        }
    }
});

test("searchWeb rejects missing API keys", async () => {
    const originalKey =
        process.env.TAVILY_API_KEY;

    delete process.env.TAVILY_API_KEY;

    try {
        await assert.rejects(
            () => searchWeb("Node.js"),
            {
                message:
                    "TAVILY_API_KEY is not configured."
            }
        );
    } finally {
        if (originalKey !== undefined) {
            process.env.TAVILY_API_KEY =
                originalKey;
        }
    }
});

test("openWebPage rejects unsafe protocols", () => {
    assert.throws(
        () => openWebPage("file:///private.txt"),
        {
            message:
                "Only http and https URLs can be opened."
        }
    );
});

test("openWebPage rejects invalid URLs", () => {
    assert.throws(
        () => openWebPage("not-a-url"),
        {
            message:
                "The webpage URL is invalid."
        }
    );
});