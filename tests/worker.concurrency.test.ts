import { describe, it, expect , beforeAll, afterAll} from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool";
import { receiverState, receiver, count } from "./test_receiver";
import { spawn } from "node:child_process"; //for running three separate workers



describe("worker concurency test",  () => {
    let receiverServer: ReturnType<typeof receiver.listen> | null = null;
    beforeAll(() => {
            receiverState.responseStatus = 200;
            receiverServer = receiver.listen(4000, () => { //start our separate receiver server before all
            console.log("Test receiver listening on port 4000");
            });
            count.requestCount = 0;
        })
    it("Concurency test with 3 workers on 1000 deliveries",  async() => { //actual test
 
        const eventIds: number[] = [];
        for (let i = 1; i <= 5; i++) { //creating 5 events before any existing endpoints to ensure no deliveries get created..
            const eventResponse = await request(app)
                .post("/events")
                .send({
                    type: "user.created",
                    data: { number: i },
                    idempotency_key: `concurrency-event-${i}`,
                });

            expect(eventResponse.status).toBe(201);
            eventIds.push(Number(eventResponse.body.event_id));
        }

        // Create the four endpoints. All of them point at the receiver's /webhook route.
        const endpointIds: number[] = [];
        for (let i = 1; i <= 4; i++) {
            const endpointResponse = await request(app)
                .post("/endpoints")
                .send({ url: "http://localhost:4000/webhook" });

            expect(endpointResponse.status).toBe(201);
            endpointIds.push(Number(endpointResponse.body.id));
        }
        //query to generate 1000 deliveries with corresponsding events and endpoints..
        await pool.query(` 
                INSERT INTO deliveries (
                event_id,
                endpoint_id,
                status,
                next_attempt_at
            )
            SELECT
                ($1::bigint[])[((i - 1) % array_length($1::bigint[], 1)) + 1],
                ($2::bigint[])[((i - 1) % array_length($2::bigint[], 1)) + 1],
                'pending',
                NOW()
            FROM generate_series(1, 1000) AS i;`,
            [eventIds, endpointIds]);

            const verifyRows = await pool.query(`
                    SELECT * FROM deliveries
                `)
            expect(verifyRows.rowCount).toBe(1000);

            // detached: true puts each worker in its own process group, so the whole
            // npm -> tsx -> node tree can be stopped later with one group kill.
            const worker1 = spawn("npm", ["run", "worker"], { detached: true });
            const worker2 = spawn("npm", ["run", "worker"], { detached: true });
            const worker3 = spawn("npm", ["run", "worker"], { detached: true });

            const workers = [worker1, worker2, worker3];
            // Generally, an operating system will provide three different basics: stdin, stdout, and stderr. So, these are the things that the operating system provides. Actually, these workers are the three spawned workers which may have their own stdout streams and log statements written in their particular files. So, those will be stored in stdout streams in their particular worker processes. So, as a parent process, we can listen on those stdout streams and print them on the parent process.
            
            const workerCounts = new Map<number, number>();

            const outputBuffers = new Map<number, string>(); //to store the respective output buffers

            function processWorkerOutput(pid: number, data: Buffer) {
                const previous = outputBuffers.get(pid) ?? ""; //retrieve the previous/last buffered line of that pid

                const combined = previous + data.toString(); //add new data to the old incomlpete buffer

                const lines = combined.split("\n"); 

                outputBuffers.set(pid, lines.pop() ?? ""); //again set the last line[probably incomplete] as the new buffer

                for (const line of lines) { //match those retrieved lines and update the counts
                    const match = line.match(
                        /worker (\d+) has claimed the delivery (\d+)/
                    );

                    if (!match) continue;

                    const workerPid = Number(match[1]);

                    workerCounts.set(
                        workerPid,
                        (workerCounts.get(workerPid) ?? 0) + 1
                    );
                }
            }
            worker1.stdout.on("data", data =>
                processWorkerOutput((worker1.pid as any), data)
            );

            worker2.stdout.on("data", data =>
                processWorkerOutput((worker2.pid as any), data)
            );

            worker3.stdout.on("data", data =>
                processWorkerOutput((worker3.pid as any), data)
            );
            async function pollDb(){ //wait until every delivery has been processed
                const deadline = Date.now() + 45000; //allowing 45sec to complete all the delivereries
                while(Date.now() < deadline){
                    const result = await pool.query(`
                        SELECT count(*)::int AS count FROM deliveries WHERE status != 'delivered'
                        `)
                    if(result.rows[0].count === 0){
                        return true;
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));

                }
                return false;
            }

            try {
                const allDelivered = await pollDb();
                // give the last stdout chunks from the workers a moment to arrive
                await new Promise(resolve => setTimeout(resolve, 300));
                expect(allDelivered).toBe(true);
            } finally { //cleaning up all the workers
                await Promise.all(workers.map(worker => new Promise<void>(resolve => { //loop into all the workers one by one. and also this is a promise because writing close doenst stops the worker instanlty, it returns a promise and needs some time
                    if(worker.exitCode !== null){ //check if it is already exitted
                        return resolve();
                    }
                    worker.once("close", () => resolve()); //exit the worker and resolve the promise
                    try {
                        process.kill(-(worker.pid as number), "SIGTERM"); //kill the whole process group
                    } catch {
                        resolve();
                    }
                })));
            }

            for (const [key, value] of workerCounts) {
                console.log(`${key}: ${value}`);
                }
                expect(count.requestCount).toBe(1000);
                expect(workerCounts.size).toBe(3);
    
                const totalClaimed = [...workerCounts.values()]
                    .reduce((total, value) => total + value, 0);
    
                expect(totalClaimed).toBe(1000);
            }, 60000);

        afterAll(() => {
            receiverServer?.close();
        })
    })
    

