import { z } from "zod";

export const endpointSchema = z.object({
    url: z.url({
        protocol: /^https?$/,
    })
});