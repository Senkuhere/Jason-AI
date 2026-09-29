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

export async function getLongTermMemories() {
    const result = await pool.query(
        `
        SELECT id, category, content, created_at, updated_at
        FROM long_term_memories
        ORDER BY updated_at DESC
        LIMIT 20
        `
    );

    return result.rows;
}

export async function saveLongTermMemory({ category, content }) {
    const result = await pool.query(
        `
        INSERT INTO long_term_memories (category, content)
        VALUES ($1, $2)
        RETURNING id, category, content, created_at, updated_at
        `,
        [category, content]
    );

    return result.rows[0];
}