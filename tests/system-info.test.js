import test from "node:test";
import assert from "node:assert/strict";

import {
    getComputerHardwareInfo,
    getOperatingSystemInfo
} from "../utility_tools/computer-system-info.js";

test("computer hardware info returns valid data", () => {
    const result = getComputerHardwareInfo();

    assert.equal(result.ok, true);

    assert.equal(
        typeof result.cpu.model,
        "string"
    );

    assert.ok(
        result.cpu.logicalCores > 0
    );

    assert.ok(
        result.cpu.speedMHz === null ||
        typeof result.cpu.speedMHz === "number"
    );

    assert.ok(
        result.memory.totalBytes > 0
    );

    assert.ok(
        result.memory.freeBytes >= 0
    );

    assert.equal(
        typeof result.architecture,
        "string"
    );

    assert.equal(
        typeof result.endianness,
        "string"
    );
});

test("operating system info returns valid data", () => {
    const result = getOperatingSystemInfo();

    assert.equal(result.ok, true);

    assert.equal(
        typeof result.operatingSystem,
        "string"
    );

    assert.equal(
        typeof result.platform,
        "string"
    );

    assert.equal(
        typeof result.release,
        "string"
    );

    assert.equal(
        typeof result.version,
        "string"
    );

    assert.equal(
        typeof result.architecture,
        "string"
    );

    assert.equal(
        typeof result.nodeVersion,
        "string"
    );
});