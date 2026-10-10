import test from "node:test";
import assert from "node:assert/strict";

import { calculator } from "../utility_tools/utility.js";

test("calculator evaluates a valid expression", () => {
    const result = calculator("(25 * 4) + 10");

    assert.equal(result, 110);
});

test("calculator rejects invalid characters", () => {
    assert.throws(
        () => calculator("25 + abc"),
        {
            message:
                "Only numbers and arithmetic operators are allowed."
        }
    );
});

test("calculator rejects an empty expression", () => {
    assert.throws(
        () => calculator(""),
        {
            message:
                "A mathematical expression is required."
        }
    );
});

test("calculator rejects non-finite results", () => {
    assert.throws(
        () => calculator("1 / 0"),
        {
            message:
                "The calculation did not produce a finite number."
        }
    );
});