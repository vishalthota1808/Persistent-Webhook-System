import {z} from "zod"
export const endpointSchema = z.object({
    url: z.string().url().refine((value) => {
        const protocol = new URL(value).protocol;

        return protocol === "http" || protocol === "https";
    })
})