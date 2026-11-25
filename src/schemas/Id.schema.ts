import {number, string, z} from "zod";

export const IdSchema = z.object({
    id : z.coerce.number().positive()

})