import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDatabaseConnection } from "../long-term-memory.js";

export function getComputerHardwareInfo() {
    const processors = os.cpus();

    return {
        ok: true,
        cpu: {
            model: processors[0]?.model || "Unknown",
            logicalCores: processors.length,
            speedMHz: processors[0]?.speed || null
        },
        memory: {
            totalBytes: os.totalmem(),
            freeBytes: os.freemem()
        },
        architecture: os.arch(),
        endianness: os.endianness()
    };
}

export function getOperatingSystemInfo() {
    return {
        ok: true,
        operatingSystem: os.type(),
        platform: os.platform(),
        release: os.release(),
        version: os.version(),
        architecture: os.arch(),
        nodeVersion: process.version
    };
}
async function checkEndpoint(name, url) {
    const startedAt = Date.now();

    try {
        const response = await fetch(url, {
            method: "GET",
            signal: AbortSignal.timeout(5000)
        });

        return {
            name,
            reachable: true,
            statusCode: response.status,
            latencyMs: Date.now() - startedAt
        };
    } catch (error) {
        return {
            name,
            reachable: false,
            statusCode: null,
            latencyMs: Date.now() - startedAt,
            error: error.message
        };
    }
}

export async function checkNetworkStatus() {
    const endpoints = [
        {
            name: "internet",
            url: "https://www.google.com/generate_204"
        },
        {
            name: "gemini_api",
            url: "https://generativelanguage.googleapis.com"
        },
        {
            name: "openai_api",
            url: "https://api.openai.com"
        },
        {
            name: "tavily_api",
            url: "https://api.tavily.com"
        },
        {
            name: "openweather_api",
            url: "https://api.openweathermap.org"
        }
    ];

    const results = await Promise.all(
        endpoints.map(endpoint =>
            checkEndpoint(endpoint.name, endpoint.url)
        )
    );

    return {
        ok: true,
        checkedAt: new Date().toISOString(),
        services: results
    };
}

export async function getJasonHealth() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const memoryFile = path.join(
        __dirname,
        "..",
        "memory",
        "short-term.json"
    );

    let memoryFileAvailable = false;

    try {
        await fs.access(memoryFile);
        memoryFileAvailable = true;
    } catch {
        memoryFileAvailable = false;
    }

    let database = {
        configured: Boolean(process.env.DATABASE_URL),
        connected: false,
        tableAvailable: false
    };

    if (database.configured) {
        try {
            const result = await checkDatabaseConnection();

            database.connected = true;
            database.tableAvailable =
                result.table_name === "long_term_memories";
        } catch {
            database.connected = false;
        }
    }

    return {
        ok:
            database.connected &&
            database.tableAvailable &&
            memoryFileAvailable,
        checkedAt: new Date().toISOString(),
        database,
        memory: {
            shortTermFileAvailable: memoryFileAvailable
        },
        providers: {
            geminiConfigured: Boolean(
                process.env.GEMINI_API_KEY
            ),
            openaiConfigured: Boolean(
                process.env.OPENAI_API_KEY
            )
        },
        services: {
            weatherConfigured: Boolean(
                process.env.OPENWEATHER_API_KEY
            ),
            webSearchConfigured: Boolean(
                process.env.TAVILY_API_KEY
            )
        },
        runtime: {
            nodeVersion: process.version,
            uptimeSeconds: Math.round(process.uptime())
        }
    };
}