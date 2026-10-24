import pg from "pg";

// The memories, kept in RAM so most requests never wait for the database
let memoryCache = null;
let memoryCacheAt = 0;                 // when the RAM copy was last read from the database
let refreshInProgress = null;          // a background refresh that is running right now, if any
const MEMORY_CACHE_MS = 30 * 60 * 1000;

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,                           // Jason never needs many connections at once
    idleTimeoutMillis: 30_000,        // let go of connections nobody is using
    connectionTimeoutMillis: 10_000,  // give up connecting after 10 seconds instead of waiting forever
    query_timeout: 15_000,            // ...and on a query that takes longer than 15 seconds
    keepAlive: true
});

// When the database drops an idle connection, the pool reports an "error". With no listener that
// error would stop all of Jason. Now it is only logged, and the pool reconnects by itself.
pool.on("error", error => {
    console.error("[database] An idle connection was lost (it will reconnect by itself):", error.message);
});

export async function checkDatabaseConnection() {
    const result = await pool.query(`
        SELECT
            NOW() AS database_time,
            to_regclass('public.long_term_memories') AS table_name
    `);

    return result.rows[0];
}

const STOP_WORDS = new Set([
    "the", "and", "that", "this", "what", "where", "when", "who",
    "which", "how", "are", "you", "your", "about", "with", "from",
    "have", "does", "did", "can", "know", "tell", "user", "my",
    "please"
]);

// Small memory stores are simply handed over in full
const SMALL_STORE_LIMIT = 25;

// Light stemming so "studying" / "studies" / "study" all match
function stem(word) {
    if (word.length <= 4) return word;

    return word
        .replace(/(ies|ied)$/, "y")
        .replace(/(ing|ed)$/, "")
        .replace(/s$/, "");
}

function tokenize(text) {
    return new Set(
        (String(text).toLowerCase().match(/[a-z0-9]+/g) || [])
            .filter(word => word.length > 2 && !STOP_WORDS.has(word))
            .map(stem)
    );
}

function countMatches(memory, queryTokens) {
    const memoryTokens = tokenize(
        [memory.memory_key, memory.category, memory.content].join(" ")
    );

    let matches = 0;
    for (const token of queryTokens) {
        if (memoryTokens.has(token)) matches++;
    }

    return matches;
}


export async function getLongTermMemories(query = "", limit = 12) {

    const memories = await loadAllMemories();

    // A personal assistant's memories are small, so just give him all of them
    if (memories.length <= SMALL_STORE_LIMIT) {
        return memories;
    }

    const queryTokens = tokenize(query);

    return memories
        .map(memory => {
            const matches = countMatches(memory, queryTokens);

            return {
                memory,
                matches,
                score:
                    matches * 10 +
                    Number(memory.importance || 5) * 0.25
            };
        })
        // keep real matches, plus anything important enough to always know
        .filter(item =>
            item.matches > 0 || Number(item.memory.importance) >= 8
        )
        .sort((first, second) => second.score - first.score)
        .slice(0, limit)
        .map(item => item.memory);
}

export async function saveLongTermMemory({
    key,
    category,
    content,
    importance = 5,
    confidence = "confirmed"
}) {
    const result = await pool.query(
        `
        INSERT INTO long_term_memories
            (memory_key, category, content, importance, confidence)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (memory_key)
        DO UPDATE SET
            category = EXCLUDED.category,
            content = EXCLUDED.content,
            importance = EXCLUDED.importance,
            confidence = EXCLUDED.confidence,
            deleted_at = NULL,
            updated_at = NOW()
        RETURNING
            id,
            memory_key,
            category,
            content,
            importance,
            confidence,
            created_at,
            updated_at
        `,
        [
            key,
            category,
            content,
            importance,
            confidence
        ]
    );
    // Keep the RAM copy in step with the database, so the next request needs no database read
    cacheUpsert(result.rows[0]);
    return result.rows[0];
}

export async function deleteLongTermMemory(key) {

    const result = await pool.query(
        `
        UPDATE long_term_memories
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE memory_key = $1
          AND deleted_at IS NULL
        RETURNING id, memory_key, content
        `,
        [key]
    );
    // Remove it from the RAM copy as well
    if (result.rows[0]) cacheRemove(key);
    return result.rows[0] || null;
}

// Reads every memory from the database and stores the result in RAM
function fetchAllMemories() {
    return pool
        .query(`
            SELECT id, memory_key, category, content, importance,
                   confidence, created_at, updated_at
            FROM long_term_memories
            WHERE deleted_at IS NULL
            ORDER BY importance DESC, updated_at DESC
            LIMIT 300
        `)
        .then(result => {
            memoryCache = result.rows;
            memoryCacheAt = Date.now();
            return memoryCache;
        });
}

async function loadAllMemories() {
    // Recent enough: use the RAM copy
    if (memoryCache && Date.now() - memoryCacheAt < MEMORY_CACHE_MS) {
        return memoryCache;
    }

    // Old but present: answer right away with it, and refresh quietly in the background for next time.
    // (A cold database connection can take a second or two, and nobody should wait for that.)
    if (memoryCache) {
        refreshInProgress ??= fetchAllMemories()
            .catch(() => {})                         // if the refresh fails, keep the old copy
            .finally(() => { refreshInProgress = null; });

        return memoryCache;
    }

    // Nothing in RAM yet: this one has to wait for the database
    return fetchAllMemories();
}

// After a save, put the new or changed memory into the RAM copy, so no database read is needed
function cacheUpsert(row) {
    if (!memoryCache) return;   // nothing cached yet; the next load reads everything anyway

    memoryCache = memoryCache.filter(item => item.memory_key !== row.memory_key);
    memoryCache.push(row);

    // Same order as the database query: most important first, then most recently updated
    memoryCache.sort(
        (first, second) =>
            Number(second.importance) - Number(first.importance) ||
            new Date(second.updated_at) - new Date(first.updated_at)
    );
}

// After a delete, remove the memory from the RAM copy
function cacheRemove(key) {
    if (!memoryCache) return;

    memoryCache = memoryCache.filter(item => item.memory_key !== key);
}