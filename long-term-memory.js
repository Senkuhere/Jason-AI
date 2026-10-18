import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
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
    const result = await pool.query(
        `
        SELECT
            id, memory_key, category, content, importance,
            confidence, created_at, updated_at
        FROM long_term_memories
        WHERE deleted_at IS NULL
        ORDER BY importance DESC, updated_at DESC
        LIMIT 300
        `
    );

    const memories = result.rows;

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

    return result.rows[0] || null;
}