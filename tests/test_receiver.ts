// this is a basic server running as a receiver for our

import express from "express";

export const receiver = express();

receiver.use(express.json());
export const receiverState = {
    payload: null as any,
    responseStatus: 200
};
receiver.post("/webhook", (req, res) => {
  receiverState.payload = req.body;
  console.log("Received webhook!");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  res.status(receiverState.responseStatus).json({
    message: "Webhook received successfully",
  });
});



//now we can use https://localhost:4000/webhook to send an actual delivery