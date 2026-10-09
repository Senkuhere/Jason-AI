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
    "the", "and", "that", "this", "what", "where", "when",
    "how", "are", "you", "about", "with", "from", "have",
    "does", "know", "tell", "user", "my"
]);

function tokenize(text) {
    return new Set(
        String(text)
            .toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.filter(word => word.length > 2 && !STOP_WORDS.has(word)) || []
    );
}

function scoreMemory(memory, queryTokens) {
    const memoryText = [
        memory.memory_key,
        memory.category,
        memory.content
    ].join(" ");

    const memoryTokens = tokenize(memoryText);

    let matchingWords = 0;

    for (const token of queryTokens) {
        if (memoryTokens.has(token)) {
            matchingWords++;
        }
    }

    const importanceBonus = Number(memory.importance || 5) * 0.25;

    return matchingWords * 10 + importanceBonus;
}

export async function getLongTermMemories(
    query = "",
    limit = 5
) {
    const result = await pool.query(
        `
        SELECT
            id,
            memory_key,
            category,
            content,
            importance,
            confidence,
            created_at,
            updated_at
        FROM long_term_memories
        WHERE deleted_at IS NULL
        ORDER BY importance DESC, updated_at DESC
        LIMIT 100
        `
    );

    const queryTokens = tokenize(query);

    const scoredMemories = result.rows
        .map(memory => ({
            memory,
            score: scoreMemory(memory, queryTokens),
            hasMatch: scoreMemory(memory, queryTokens) > 0
        }))
        .filter(item => {
            const isHighlyImportant = item.memory.importance >= 9;

            return item.hasMatch || isHighlyImportant;
        })
        .sort((first, second) => {
            return second.score - first.score;
        })
        .slice(0, limit);

    return scoredMemories.map(item => item.memory);
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