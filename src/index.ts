import express from "express";
import { pool } from "./db/pool.js";
import { validate } from "./schemas/validate.js";
import { endpointSchema } from "./schemas/endpoint.schema.js";
import { eventSchema } from "./schemas/event.schema.js";
import crypto from "crypto";
import { connect } from "http2";
import { eventQuerySchema } from "./schemas/eventQuery.schema.js";
import { safeParse, validateAsync } from "zod";
import { pathToFileURL } from "url";
import { IdSchema } from "./schemas/Id.schema.js";
import { deliveriesSchema } from "./schemas/deliveries.schema.js";
// import {Request, Response} from "types/express"

const app = express();
app.use(requestLogger); //enables the express app to use this function as part of middleware pipeline
app.use(express.json()); //this is a pre built express middleware which automatically pareses the json and raises an error on invalid json parsing. and it also has a statement of next(err) which handles the error to next error handling middleware.

function requestLogger(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const startTime: number = Date.now();
  res.on("finish", () => {
    const elapsedTime: number = Date.now() - startTime;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${elapsedTime}ms`);
  });
  next();
}

function errorHandler(
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid json" });
  } else {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
  next();
}

function endpointHandler(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  res.status(404).json({ error: "404 Not found" });
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch (error) {
    console.log("Health check failed", error);
    res.status(503).json({ status: "error", db: "down" });
  }
});

app.post("/echo", (req, res) => {
  const data = req.body;

  res.status(200).json({ status: "success", body: data });
});

//NOTE: Here the parameter in the midlle of path and function, i.e validate is a route specific middleware.

app.post("/endpoints", validate(endpointSchema), async (req, res, next) => {
  const url: string = req.body.url;
  const secret: string = "whsec_" + crypto.randomBytes(24).toString("base64");
  // const new_endpoint = {url: url, secret:secret};
  try {
    await pool.query("INSERT INTO endpoints (url, secret) VALUES ($1, $2)", [
      url,
      secret,
    ]);
  } catch (err) {
    return next(err); //handling the errors with middlware supporst
  }

  res.status(201).json({ message: "created", secret: secret });
});

app.post("/events", validate(eventSchema), async (req, res, next) => {
  const { type, data, idempotency_key } = req.body;
  const idempotencyKey = idempotency_key
    ? idempotency_key
    : crypto.randomUUID();
  // const activeEndpoints = await pool.query("SELECT * FROM endpoints WHERE endpoints.active = TRUE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eventResult = await client.query(
      "INSERT INTO events (type, payload, idempotency_key) VALUES ($1, $2, $3) RETURNING id",
      [type, data, idempotencyKey],
    );
    const eventId = eventResult.rows[0].id;
    const deliveryResult = await client.query(
      "INSERT INTO deliveries (event_id, endpoint_id) SELECT $1, id FROM endpoints WHERE active = TRUE",
      [eventId],
    );
    await client.query("COMMIT");
    return res.status(201).json({
      event_id: eventId,
      deliveries_created: deliveryResult.rowCount,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (RollBackError) {
      return next(RollBackError);
    }
    return next(err);
  } finally {
    client.release();
  }
});

app.get(
  "/events",
  validate(eventQuerySchema, "query"),
  async (req, res, next) => {
    //get events endpoint with proper filtering
    const params = req.validatedData;
    try {
      const data = await pool.query(
        "SELECT * FROM events WHERE ($1::TEXT IS NULL OR type = $1) ORDER BY created_at DESC LIMIT $2",
        [params.type, params.limit],
      );
      //this is a conditional query statement...., where ::TEXT is explicit typecasting because for null value it may not determine the data type
      res.status(200).json({ message: "success", data: data });
    } catch (err) {
      next(err);
    }
  },
);

app.get("/events/:id", validate(IdSchema, "params"), async (req, res, next) => {
  const params = req.validatedData;
  try {
    const result = await pool.query(
      `SELECT
                                            events.id,
                                            events.type,
                                            events.payload,
                                            events.created_at,
                                            COALESCE(
                                                json_agg(
                                                    json_build_object(
                                                        'id', deliveries.id,
                                                        'status', deliveries.status,
                                                        'endpoint_id', deliveries.endpoint_id,
                                                        'next_attempt_at', deliveries.next_attempt_at
                                                    )
                                                ) FILTER (WHERE deliveries.id IS NOT NULL),
                                                '[]'::json
                                            ) AS deliveries
                                        FROM events
                                        LEFT JOIN deliveries
                                            ON deliveries.event_id = events.id
                                        WHERE events.id = $1
                                        GROUP BY events.id;
                                        `,
      [params.id],
    );

    // Basically, while using join in SQL queries, it will return multiple rows. So, in order to aggregate all those rows into one, we use json_agg function.
    // explaining the query: first selecting the required columns from events, json_build_object converts each row to object then json_agg converts them into an array, filtering  left join null values, used [] to return if no events exist
    if (!result.rows[0]) {
      res.status(404).json({ message: "not found" });
      return;
    }
    res.status(200).json({ message: "success", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get(
  "/deliveries",
  validate(deliveriesSchema, "query"),
  async (req, res, next) => {
    const params = req.validatedData;
    console.log(params);
    console.log(req.query);
    try {
      const result = await pool.query(
        `SELECT * FROM deliveries WHERE ($1::TEXT IS NULL OR status = $1)
            AND ($2::BIGINT IS NULL OR endpoint_id = $2)
            AND ($3::BIGINT IS NULL OR event_id = $3) ORDER BY next_attempt_at DESC LIMIT $4`,
        [params.status, params.endpoint_id, params.event_id, params.limit],
      );
      res.status(200).json({ message: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  "/deliveries/:id",
  validate(IdSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = req.validatedData;

      const result = await pool.query(
        `SELECT
                deliveries.id,
                deliveries.event_id,
                deliveries.endpoint_id,
                deliveries.status,
                deliveries.next_attempt_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', attempts.id,
                            'delivery_id' , attempts.delivery_id,
                            'response_status', attempts.response_status
                        )
                    ) FILTER (WHERE attempts.id IS NOT NULL),
                    '[]'::json
                ) AS attempts
            FROM deliveries
            LEFT JOIN attempts
                ON attempts.delivery_id = deliveries.id
            WHERE deliveries.id = $1
            GROUP BY deliveries.id`,
        [id],
      );

      if (result.rows.length === 0) {
        return next(new Error("Delivery not found"));
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

app.use(endpointHandler); //this middleware is encountered when the endpoint requested in not valid.
app.use(errorHandler); //this should be declare this middleware at the end.

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
