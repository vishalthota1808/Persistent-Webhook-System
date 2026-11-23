import {z} from "zod";

export const eventSchema = z.object({
    type: z.string(),
    data: z.object(),
    idempotency_key: z.string().optional()
})