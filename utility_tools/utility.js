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
