import {string, z} from "zod";

export const eventQuerySchema = z.object({
    limit: z.coerce.number().positive().max(100).default(20),
    type: string().optional()

})