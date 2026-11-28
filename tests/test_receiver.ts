// this is a basic server running as a receiver for our

import express from "express";

export const receiver = express();

receiver.use(express.json());
export const receiverState = {
    payload: null as any,
    responseStatus: 200,
    delayMs: 0,
    concurencyDelay : 0
};
export const count = {
  requestCount: 0
} 
receiver.post("/webhook", async (req, res) => {
  count.requestCount = count.requestCount+1;
  receiverState.payload = req.body;
  await new Promise(resolve => setTimeout(resolve, receiverState.delayMs)); // this isfor testing REQUEST_TIMEOUTs.
  await new Promise(resolve => setTimeout(resolve, receiverState.concurencyDelay)); //this is for our concurrent 1000 deliveries 3 workers demo
  console.log("Received webhook!");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  res.status(receiverState.responseStatus).json({
    message: "Webhook received successfully",
  });
});



//now we can use https://localhost:4000/webhook to send an actual delivery
// so, in the above, we are awaiting a new promise of delaying the response from this particular receiver by about 50 milliseconds. we are doing this for our concurrency demo of having like three workers working on 1000 deliveries. so, if we don't have like the 50 milliseconds of delay, and if the receiver will respond it instantly within 1 millisecond, then we might possibly get that worker one which had started earlier. will try to complete all the deliveries instantly and leave very few deliveries for worker 2 and worker 3 to compete. so, this becomes very unusual distributions of accepting and delivering deliveries by three workers. so, if we delay the response of the receiver by 50 milliseconds or some small number, this will enable to have or compete. all the three workers in delivering and accepting the request from the receiver.