import express from "express"
import { pool } from "./db/pool.js"
import { validate } from "./schemas/validate.js"
import { endpointSchema } from "./schemas/endpoint.schema.js"
import { eventSchema } from "./schemas/event.schema.js"
import crypto from "crypto"
import { connect } from "http2"
// import {Request, Response} from "types/express"



const app = express()
app.use(requestLogger) //enables the express app to use this function as part of middleware pipeline
app.use(express.json()) //this is a pre built express middleware which automatically pareses the json and raises an error on invalid json parsing. and it also has a statement of next(err) which handles the error to next error handling middleware.

function requestLogger(req: express.Request, res: express.Response, next: express.NextFunction){
    const startTime: number = Date.now();
    res.on('finish', () => {
        const elapsedTime: number = Date.now() - startTime;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${elapsedTime}ms`);
    })
    next();
}

function errorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction){
    if(err.type === "entity.parse.failed"){
        res.status(400).json({error:"Invalid json"});
    }
    else{
        console.log(err);
        res.status(500).json({error: "Internal server error"});
    }
    next()
}

function endpointHandler(req: express.Request, res: express.Response, next: express.NextFunction){
    res.status(404).json({error: "404 Not found"})
}


app.get('/health', async(req, res) => {
    try{
        await pool.query("SELECT 1");
        res.json({status: "ok", db: "up"})
    }
    catch(error){
        console.log("Health check failed", error)
        res.status(503).json({status: "error", db: "down"})
    }
});

app.post('/echo', (req, res) => {
    const data = req.body;
    
    res.status(200).json({status: "success", body: data})
})

//NOTE: Here the parameter in the midlle of path and function, i.e validate is a route specific middleware.

app.post('/endpoints', validate(endpointSchema), async(req, res, next) => {
    const url:String = req.body.url;
    const secret: string = "whsec_" + crypto.randomBytes(24).toString("base64");
    // const new_endpoint = {url: url, secret:secret};
    try{
        await pool.query(
            "INSERT INTO endpoints (url, secret) VALUES ($1, $2)",
            [url, secret]
        );
    }
    catch(err){
        return next(err);
    }

    res.status(201).json({message: "created", secret: secret});
    
})

app.post('/events', validate(eventSchema), async(req, res, next) => {
    const {type, data, idempotency_key} = req.body;
    const idempotencyKey = idempotency_key? idempotency_key : crypto.randomUUID();
    // const activeEndpoints = await pool.query("SELECT * FROM endpoints WHERE endpoints.active = TRUE");
    const client = await pool.connect();
    try{
        await client.query("BEGIN")
        const eventResult = await client.query("INSERT INTO events (type, payload, idempotency_key) VALUES ($1, $2, $3) RETURNING id", [type, data, idempotencyKey]);
        const eventId = eventResult.rows[0].id;
        const deliveryResult = await client.query("INSERT INTO deliveries (event_id, endpoint_id) SELECT $1, id FROM endpoints WHERE active = TRUE", [eventId])
        await client.query("COMMIT")
        return res.status(201).json({
            event_id: eventId,
            deliveries_created: deliveryResult.rowCount
        });
    }
    catch(err){
        try{
            await client.query("ROLLBACK");
        }
        catch(RollBackError){
            return next(RollBackError)
        }
        return next(err);
    }
    finally{
        client.release();
    }



})

app.use(endpointHandler) //this middleware is encountered when the endpoint requested in not valid.
app.use(errorHandler) //this should be declare this middleware at the end.

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () =>{
    console.log(`Server is running at http://localhost:${PORT}`)
})