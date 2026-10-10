import test from "node:test";
import assert from "node:assert/strict";

import {
    getJasonHealth
} from "../utility_tools/computer-system-info.js";

test("Jason health returns a complete health report", async () => {
    const originalDatabaseUrl =
        process.env.DATABASE_URL;

    delete process.env.DATABASE_URL;

    try {
        const result = await getJasonHealth();

        assert.equal(typeof result.ok, "boolean");
        assert.equal(typeof result.checkedAt, "string");

        assert.equal(
            typeof result.database,
            "object"
        );

        assert.equal(
            result.database.configured,
            false
        );

        assert.equal(
            typeof result.database.connected,
            "boolean"
        );

        assert.equal(
            typeof result.database.tableAvailable,
            "boolean"
        );

        assert.equal(
            typeof result.memory.shortTermFileAvailable,
            "boolean"
        );

        assert.equal(
            typeof result.providers.geminiConfigured,
            "boolean"
        );

        assert.equal(
            typeof result.providers.openaiConfigured,
            "boolean"
        );

        assert.equal(
            typeof result.services.weatherConfigured,
            "boolean"
        );

        assert.equal(
            typeof result.services.webSearchConfigured,
            "boolean"
        );

        assert.equal(
            typeof result.runtime.nodeVersion,
            "string"
        );

        assert.equal(
            typeof result.runtime.uptimeSeconds,
            "number"
        );
    } finally {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL =
                originalDatabaseUrl;
        }
    }
});