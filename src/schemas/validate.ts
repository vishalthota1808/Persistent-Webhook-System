import {z} from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodType){
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if(!result.success){
            return next(result.error)
        }
        next();
    }
} 
//this is a outer function which accepts the schema and returns a middleware function[which accepts req, res, next]
