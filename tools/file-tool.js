import { promises as fs } from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(process.cwd());

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