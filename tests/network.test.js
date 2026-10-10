import test from "node:test";
import assert from "node:assert/strict";

import {
    checkNetworkStatus
} from "../utility_tools/computer-system-info.js";

test("network status reports reachable services", async t => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => ({
            status: 204
        })
    );

    const result = await checkNetworkStatus();

    assert.equal(result.ok, true);
    assert.equal(Array.isArray(result.services), true);
    assert.equal(result.services.length, 5);

    for (const service of result.services) {
        assert.equal(service.reachable, true);
        assert.equal(typeof service.name, "string");
        assert.equal(typeof service.latencyMs, "number");
    }
});

test("network status reports failed endpoints", async t => {
    t.mock.method(
        globalThis,
        "fetch",
        async url => {
            if (url.includes("tavily")) {
                throw new Error("Simulated network failure.");
            }

            return {
                status: 204
            };
        }
    );

    const result = await checkNetworkStatus();

    const tavilyService = result.services.find(
        service => service.name === "tavily_api"
    );

    assert.ok(tavilyService);
    assert.equal(tavilyService.reachable, false);
    assert.equal(
        tavilyService.error,
        "Simulated network failure."
    );
});