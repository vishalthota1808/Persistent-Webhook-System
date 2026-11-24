import {z} from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodType, source: "body" | "query" | "params" = "body"){
    return (req: Request, res: Response, next: NextFunction) => {
        let result;
        if(source == "body"){
            result = schema.safeParse(req.body)
        }
        else if(result == "query"){
            result = schema.safeParse(req.query);
        }
        else {
            result = schema.safeParse(req.params);
        }

        
        if(!result.success){
            return next(result.error)
        }
        req.validatedData = result.data; //this is most important because this we cannot use parsed values like parsed string to number, and default values etc
        next();
    }
} 
//this is a outer function which accepts the schema and returns a middleware function[which accepts req, res, next]
//since normal valiadate function just validates req.body , to use this for validating req.query, req.params also we need to modify.