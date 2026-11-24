import {number, string, z} from "zod";

export const deliveriesSchema = z.object({
    status: z.enum(["pending", "in_flight", "delivered", "failed"]).optional(),
    endpoint_id: z.coerce.number().int().positive().optional(),
    event_id: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20)
})