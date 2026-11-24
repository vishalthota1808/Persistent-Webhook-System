import {number, string, z} from "zod";

export const eventIdSchema = z.object({
    id : number().positive()

})