//here the sole purpose of this file is, generally we can have only few methods like req.body, req.query, req.params etc. in order to use our own custom fields like req.validatedData we must extend the existing Typescript request interface 
declare global {
    namespace Express { //writes this chaneg into @types/express
        interface Request {
            validatedData: any;
        }
    }
}

export {};