import { promises as fs } from "fs";
import path from "path";


const PROJECT_ROOT = path.resolve(
    process.env.JASON_WORKSPACE_ROOT || process.cwd()
);


// FOLDER CREATION TOOL
export async function createFolderDirectory(directoryPath) {
    if (!directoryPath || typeof directoryPath !== "string") {
        throw new Error("A directory path is required.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, directoryPath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: directory is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive path.");
    }

    await fs.mkdir(absolutePath, { recursive: true });

    return `Successfully created directory ${directoryPath}.`;
}

// LIST DIRECTORY TOOL
export async function listProjectDirectory(
    directoryPath = ".",
    recursive = false
) {
    if (typeof directoryPath !== "string") {
        throw new Error("A directory path is required.");
    }

    if (typeof recursive !== "boolean") {
        throw new Error("The recursive option must be true or false.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, directoryPath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: directory is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive path.");
    }

    const stats = await fs.stat(absolutePath);

    if (!stats.isDirectory()) {
        throw new Error("The requested path is not a directory.");
    }

    const entries = [];

    async function collectEntries(currentPath) {
        const directoryEntries = await fs.readdir(currentPath, {
            withFileTypes: true
        });

        for (const entry of directoryEntries) {
            if (entry.name === ".env") {
                continue;
            }

            const entryPath = path.join(currentPath, entry.name);
            const entryRelativePath = path.relative(
                PROJECT_ROOT,
                entryPath
            );

            const isDirectory = entry.isDirectory();

            entries.push({
                path: entryRelativePath,
                type: isDirectory ? "directory" : "file"
            });
            if (entries.length >= 500) {
            return {
            directory: directoryPath,
            recursive,
            truncated: entries.length >= 500,
            entries
        };
        }

            if (recursive && isDirectory) {
                await collectEntries(entryPath);
            }
        }
    }

    await collectEntries(absolutePath);

    return {
        directory: directoryPath,
        recursive,
        entries
    };
}

// READ FILE TOOL
export async function readProjectFile(filePath) {
    if (!filePath || typeof filePath !== "string") {
        throw new Error("A file path is required.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: file is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive file.");
    }

    const stats = await fs.stat(absolutePath);

    if (!stats.isFile()) {
        throw new Error("The requested path is not a file.");
    }

    if (stats.size > 100_000) {
        throw new Error("File is too large to read.");
    }

    return fs.readFile(absolutePath, "utf8");
}
// WRITE FILE TOOL
export async function writeProjectFile(filePath, content) {
    if (!filePath || typeof filePath !== "string") {
        throw new Error("A file path is required.");
    }

    if (typeof content !== "string") {
        throw new Error("File content must be a string.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: file is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive file.");
    }

    await fs.writeFile(absolutePath, content, "utf8");

    return `Successfully wrote to ${filePath}.`;
}

// APPEND FILE TOOL
export async function appendProjectFile(filePath, content) {
    if (!filePath || typeof filePath !== "string") {
        throw new Error("A file path is required.");
    }

    if (typeof content !== "string") {
        throw new Error("Content must be a string.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: file is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive file.");
    }

    await fs.appendFile(absolutePath, content, "utf8");

    return `Successfully appended to ${filePath}.`;
}

// EDIT FILE TOOL
export async function editProjectFile(filePath, oldText, newText) {
    if (!filePath || typeof filePath !== "string") {
        throw new Error("A file path is required.");
    }

    if (typeof oldText !== "string" || oldText.length === 0) {
        throw new Error("The existing text to replace is required.");
    }

    if (typeof newText !== "string") {
        throw new Error("Replacement text must be a string.");
    }

    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("Access denied: file is outside the project.");
    }

    if (path.basename(absolutePath) === ".env") {
        throw new Error("Access denied: sensitive file.");
    }

    const currentContent = await fs.readFile(absolutePath, "utf8");

    const occurrences =
        currentContent.split(oldText).length - 1;

    if (occurrences === 0) {
        throw new Error("The specified text was not found in the file.");
    }

    if (occurrences > 1) {
        throw new Error(
            "The specified text appears more than once. Refusing to edit ambiguously."
        );
    }

    const updatedContent = currentContent.replace(
        oldText,
        newText
    );

    await fs.writeFile(
        absolutePath,
        updatedContent,
        "utf8"
    );

    return `Successfully edited ${filePath}.`;
}


