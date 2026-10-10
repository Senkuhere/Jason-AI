import test from "node:test";
import assert from "node:assert/strict";

import {
    getToolDefinitions,
    getCapability,
    executeCapability,
    getCapabilitySummary
} from "../capability-registry.js";

test("every registered capability has a valid definition", () => {
    const groups = getToolDefinitions();

    const definitions = groups.flatMap(
        group => group.functionDeclarations || []
    );

    assert.ok(definitions.length > 0);

    for (const definition of definitions) {
        assert.equal(typeof definition.name, "string");
        assert.ok(definition.name.length > 0);

        assert.equal(
            typeof definition.description,
            "string"
        );

        assert.equal(
            typeof definition.parameters,
            "object"
        );

        const registered = getCapability(
            definition.name
        );

        assert.ok(registered);
        assert.equal(
            typeof registered.execute,
            "function"
        );
    }
});

test("unknown capabilities fail clearly", async () => {
    await assert.rejects(
        () => executeCapability("unknown_capability"),
        {
            message: "Unknown capability: unknown_capability"
        }
    );
});

test("calculator capability executes through the registry", async () => {
    const result = await executeCapability(
        "calculator",
        {
            expression: "10 + 5"
        }
    );

    assert.equal(result, 15);
});

test("capability summary describes registered capabilities", () => {
    const summary = getCapabilitySummary();

    assert.ok(summary.length > 0);

    for (const item of summary) {
        assert.equal(typeof item.name, "string");
        assert.equal(typeof item.description, "string");
        assert.equal(typeof item.mutating, "boolean");
    }
});

test("list_capabilities executes through the registry", async () => {
    const result = await executeCapability(
        "list_capabilities"
    );

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
});