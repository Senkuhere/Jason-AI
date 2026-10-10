import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
    createFolderDirectory,
    readProjectFile,
    writeProjectFile,
    appendProjectFile,
    editProjectFile,
    listProjectDirectory
} from "../file_tools/file-tool.js";

test("file capabilities create, read, edit, append, and list files", async () => {
    const temporaryDirectory = await fs.mkdtemp(
        path.join(process.cwd(), "tests", "temp-")
    );

    const relativeDirectory = path.relative(
        process.cwd(),
        temporaryDirectory
    );

    const filePath = path.join(
        relativeDirectory,
        "example.txt"
    );

    try {
        await writeProjectFile(
            filePath,
            "Hello Jason."
        );

        const initialContent = await readProjectFile(
            filePath
        );

        assert.equal(
            initialContent,
            "Hello Jason."
        );

        await appendProjectFile(
            filePath,
            "\nSecond line."
        );

        await editProjectFile(
            filePath,
            "Hello Jason.",
            "Hello Jason AI."
        );

        const updatedContent = await readProjectFile(
            filePath
        );

        assert.equal(
            updatedContent,
            "Hello Jason AI.\nSecond line."
        );

        const directoryContents =
            await listProjectDirectory(
                relativeDirectory,
                false
            );

        assert.ok(
            directoryContents.entries.some(
                entry => entry.path.endsWith("example.txt")
            )
        );

        const nestedDirectory = path.join(
            relativeDirectory,
            "nested"
        );

        await createFolderDirectory(
            nestedDirectory
        );

        const nestedContents =
            await listProjectDirectory(
                relativeDirectory,
                false
            );

        assert.ok(
            nestedContents.entries.some(
                entry =>
                    entry.path.endsWith("nested") &&
                    entry.type === "directory"
            )
        );
    } finally {
        await fs.rm(
            temporaryDirectory,
            {
                recursive: true,
                force: true
            }
        );
    }
});

test("file capabilities reject paths outside the project", async () => {
    await assert.rejects(
        () => readProjectFile("../package.json"),
        /Access denied/
    );
});

test("file capabilities protect the environment file", async () => {
    await assert.rejects(
        () => readProjectFile(".env"),
        /Access denied/
    );
});