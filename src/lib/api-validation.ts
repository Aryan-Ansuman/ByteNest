export class ApiValidationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
        this.name = "ApiValidationError";
    }
}

export function requireString(
    value: unknown,
    field: string,
    opts: { min?: number; max?: number } = {}
): string {
    if (typeof value !== "string") {
        throw new ApiValidationError(`${field} is required`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new ApiValidationError(`${field} is required`);
    }
    if (opts.min && trimmed.length < opts.min) {
        throw new ApiValidationError(`${field} must be at least ${opts.min} characters`);
    }
    if (opts.max && trimmed.length > opts.max) {
        throw new ApiValidationError(`${field} must be under ${opts.max} characters`);
    }
    return trimmed;
}

export function requireEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    field: string
): T {
    if (typeof value !== "string" || !allowed.includes(value as T)) {
        throw new ApiValidationError(`${field} must be one of: ${allowed.join(", ")}`);
    }
    return value as T;
}

export function requireStringArray(
    value: unknown,
    field: string,
    opts: { min?: number; max?: number; itemMax?: number } = {}
): string[] {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        throw new ApiValidationError(`${field} must be an array of strings`);
    }
    const cleaned = value.map((v) => v.trim()).filter(Boolean);
    if (opts.min !== undefined && cleaned.length < opts.min) {
        throw new ApiValidationError(`${field} must include at least ${opts.min} item(s)`);
    }
    if (opts.max !== undefined && cleaned.length > opts.max) {
        throw new ApiValidationError(`${field} can include at most ${opts.max} item(s)`);
    }
    if (opts.itemMax !== undefined && cleaned.some((v) => v.length > opts.itemMax!)) {
        throw new ApiValidationError(`each ${field} item must be under ${opts.itemMax} characters`);
    }
    return cleaned;
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiValidationError("Invalid request body");
    }
    return body as Record<string, unknown>;
}
