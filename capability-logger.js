import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

function toJson(value) {
    return JSON.stringify(value ?? null);
}

export async function logCapability({
    capabilityName,
    args = {},
    status,
    result = null,
    errorName = null,
    errorMessage = null,
    durationMs = null,
    agentStep = null
}) {
    try {
        await pool.query(
            `
            INSERT INTO capability_logs (
                capability_name,
                arguments,
                status,
                result,
                error_name,
                error_message,
                duration_ms,
                agent_step
            )
            VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6, $7, $8)
            `,
            [
                capabilityName,
                toJson(args),
                status,
                toJson(result),
                errorName,
                errorMessage,
                durationMs,
                agentStep
            ]
        );
        await pool.query(
            `
            DELETE FROM capability_logs
            WHERE id IN (
                SELECT id
                FROM capability_logs
                ORDER BY created_at DESC, id DESC
                OFFSET 120
            )
            `
        );
        console.log(
            "Capability logged:",
            capabilityName,
            status
        );
    } catch (error) {
        console.error(
            "Capability log failed:",
            error.message
        );
    }
}