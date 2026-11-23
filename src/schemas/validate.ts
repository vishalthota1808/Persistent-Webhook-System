import {z} from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodType){
    return (res: Response, req:Request, next: NextFunction) => {
        const result = schema.safeParse(req);

        if(!result.success){
            return next(result.error)
        }
        next();
    }
} 
//this is a validate function which can be used for schema validation of the request. 
//u can use this while accepting in endpoints. 