// json-store.js: a small, safe way for Jason's modules to keep their data in a JSON file under memory/.
// Loads once, saves in order and through a temporary file (so a crash can never leave a half-written file),
// and keeps a damaged file aside instead of overwriting it.
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MEMORY_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "memory");

// createStore("rhythm.json", { settings: {} }) -> { load, data, save }
export function createStore(fileName, defaults) {
    const file = path.join(MEMORY_DIRECTORY, fileName);
    const fresh = () => JSON.parse(JSON.stringify(defaults));

    let data = fresh();
    let loaded = false;
    let chain = Promise.resolve();

    return {
        // Reads the file once. Always returns the live data object.
        async load() {
            if (loaded) return data;
            loaded = true;

            try {
                const saved = JSON.parse(await fs.readFile(file, "utf8"));
                // Anything missing in an older file is filled in from the defaults
                data = { ...fresh(), ...(saved && typeof saved === "object" ? saved : {}) };
            } catch (error) {
                data = fresh();

                if (error.code !== "ENOENT") {
                    console.error(`[${fileName}] Could not read it, starting fresh:`, error.message);
                    await fs.rename(file, `${file}.damaged-${Date.now()}`).catch(() => {});
                }
            }

            return data;
        },

        get data() {
            return data;
        },

        save() {
            chain = chain.then(async () => {
                try {
                    await fs.mkdir(MEMORY_DIRECTORY, { recursive: true });

                    const text = JSON.stringify(data, null, 2);
                    const temporary = `${file}.tmp`;

                    await fs.writeFile(temporary, text, "utf8");

                    try {
                        await fs.rename(temporary, file);
                    } catch {
                        await fs.writeFile(file, text, "utf8");    // Windows sometimes refuses the swap briefly
                    }
                } catch (error) {
                    console.error(`[${fileName}] Could not save:`, error.message);
                }
            });

            return chain;
        }
    };
}
