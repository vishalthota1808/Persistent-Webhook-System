import {number, string, z} from "zod";

export const eventIdSchema = z.object({
    id : z.coerce.number().positive()

})