import express from "express"
import { pool } from "./db/pool.js"
// import {Request, Response} from "types/express"

const app = express()
app.use(express.json())

app.get('/', async(req, res) => {
    try{
        await pool.query("SELECT 1");
        res.json({status: "ok", db: "up"})
    }
    catch(error){
        console.log("Health check failed", error)
        res.status(503).json({status: "error", db: "down"})
    }
});
const PORT = Number(process.env.PORT) | 3000;
app.listen(PORT, () =>{
    console.log(`Server is running at http://localhost:${PORT}`)
})