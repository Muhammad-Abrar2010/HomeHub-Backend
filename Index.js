const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
app.use(cors(corsConfig));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u8mb1p2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const estateCollection = client.db("estateDB").collection("estate");
    const userCollection = client.db("estateDB").collection("users");

    app.get("/estates", async (req, res) => {
      try {
        const result = await estateCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve estates" });
      }
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve estates" });
      }
    });
  } catch (error) {
    console.error(error);
  }
}

app.listen(port, () => {
  console.log(`Home Hub Server Running on port ${port}`);
});

run().catch(console.dir);
