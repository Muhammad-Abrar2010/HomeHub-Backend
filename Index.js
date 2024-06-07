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
    const wishlistCollection = client.db("estateDB").collection("wishlist");
    const offerCollection = client.db("estateDB").collection("offers");
    const reviewsCollection = client.db("estateDB").collection("reviews");

    app.get("/estates", async (req, res) => {
      try {
        const result = await estateCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed to retrieve estates:", error);
        res.status(500).send({ error: "Failed to retrieve estates" });
      }
    });
    app.post("/addProperty", async (req, res) => {
      const {
        property_title,
        property_location,
        property_image,
        agent_name,
        agent_email,
        verification_status,
        price_range,
        agent_image
      } = req.body;

      try {
        const newProperty = {
          property_title,
          property_location,
          property_image,
          agent_name,
          agent_email,
          verification_status,
          price_range,
          agent_image,
          createdAt: new Date(),
        };

        const result = await estateCollection.insertOne(newProperty);
        res
          .status(201)
          .json({
            message: "Property added successfully",
            propertyId: result.insertedId,
          });
      } catch (error) {
        console.error("Failed to add property:", error);
        res.status(500).json({ error: "Failed to add property" });
      }
    });

    app.get("/estates/:id", async (req, res) => {
      const estateId = req.params.id;
      try {
        const property = await estateCollection.findOne({
          _id: new ObjectId(estateId),
        });
        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }
        res.status(200).json(property);
      } catch (error) {
        console.error("Failed to fetch estates:", error);
        res.status(500).json({ error: "Failed to fetch estates" });
      }
    });

    app.put("/updateProperty/:id", async (req, res) => {
      const propertyId = req.params.id;
      const { property_title, property_location, property_image, price_range } =
        req.body;

      try {
        const updatedProperty = {
          property_title,
          property_location,
          property_image,
          price_range,
          updatedAt: new Date(),
        };

        const result = await estateCollection.updateOne(
          { _id: new ObjectId(propertyId) },
          { $set: updatedProperty }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.status(200).json({ message: "Property updated successfully" });
      } catch (error) {
        console.error("Failed to update property:", error);
        res.status(500).json({ error: "Failed to update property" });
      }
    });

    app.delete("/deleteProperty/:id", async (req, res) => {
      const propertyId = req.params.id;
    
      try {
        const result = await estateCollection.deleteOne({ _id: new ObjectId(propertyId) });
    
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }
    
        res.status(200).json({ message: "Property deleted successfully" });
      } catch (error) {
        console.error("Failed to delete property:", error);
        res.status(500).json({ error: "Failed to delete property" });
      }
    });

    app.get("/properties", async (req, res) => {
      const { agentEmail } = req.query;
      try {
        const properties = await estateCollection.find({ agent_email: agentEmail }).toArray();
        res.status(200).json(properties);
      } catch (error) {
        console.error("Failed to fetch properties:", error);
        res.status(500).json({ error: "Failed to fetch properties" });
      }
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed to retrieve users:", error);
        res.status(500).send({ error: "Failed to retrieve users" });
      }
    });

    app.post("/wishlist", async (req, res) => {
      const { email, estateId } = req.body;
      try {
        const existingWishlist = await wishlistCollection.findOne({
          email,
          estateId,
        });
        if (existingWishlist) {
          return res
            .status(400)
            .json({ message: "Property already in wishlist" });
        }
        await wishlistCollection.insertOne({ email, estateId });
        res.status(201).json({ message: "Property added to wishlist" });
      } catch (error) {
        console.error("Failed to add property to wishlist:", error);
        res.status(500).json({ error: "Failed to add property to wishlist" });
      }
    });

    app.get("/wishlist/:email", async (req, res) => {
      const userEmail = req.params.email;
      try {
        const wishlistItems = await wishlistCollection
          .find({ email: userEmail })
          .toArray();
        res.status(200).json(wishlistItems);
      } catch (error) {
        console.error("Failed to fetch wishlist:", error);
        res.status(500).json({ error: "Failed to fetch wishlist" });
      }
    });

    app.delete("/wishlist/:estateId", async (req, res) => {
      const { email } = req.query;
      const estateId = req.params.estateId;
      try {
        const deleteResult = await wishlistCollection.deleteOne({
          email,
          estateId,
        });
        if (deleteResult.deletedCount === 0) {
          return res
            .status(404)
            .json({ message: "Property not found in wishlist" }); // Send 404 for not found
        }
        res.status(200).json({ message: "Property removed from wishlist" });
      } catch (error) {
        console.error("Failed to remove property from wishlist:", error);
        res
          .status(500)
          .json({ error: "Failed to remove property from wishlist" });
      }
    });

    app.post("/offers", async (req, res) => {
      const {
        estateId,
        property_title,
        property_location,
        agent_name,
        offered_amount,
        buyer_email,
        buyer_name,
        buying_date,
        status,
      } = req.body;

      try {
        const estate = await estateCollection.findOne({
          _id: new ObjectId(estateId),
        });
        if (!estate) {
          return res.status(404).json({ message: "Property not found" });
        }

        const priceRange = estate.price_range.split("-");
        const minPrice = parseFloat(priceRange[0].trim());
        const maxPrice = parseFloat(priceRange[1].trim());

        if (offered_amount < minPrice || offered_amount > maxPrice) {
          return res.status(400).json({
            message: "Offered amount must be within the specified price range",
          });
        }

        await offerCollection.insertOne({
          estateId,
          property_title,
          property_location,
          agent_name,
          offered_amount,
          buyer_email,
          buyer_name,
          buying_date: new Date(buying_date),
          status,
        });

        res.status(201).json({
          estateId,
          property_title,
          property_location,
          agent_name,
          offered_amount,
          buyer_email,
          buyer_name,
          buying_date: new Date(buying_date),
          status,
        });
      } catch (error) {
        console.error("Failed to submit offer:", error);
        res.status(500).json({ message: "Failed to submit offer" });
      }
    });

    app.get("/offers", async (req, res) => {
      try {
        const result = await offerCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed to retrieve offers:", error);
        res.status(500).send({ error: "Failed to retrieve offers" });
      }
    });

    app.get("/offers/:email", async (req, res) => {
      const userEmail = req.params.email;
      try {
        const offers = await offerCollection
          .find({ buyer_email: userEmail })
          .toArray();
        res.status(200).json(offers);
      } catch (error) {
        console.error("Failed to fetch offers:", error);
        res.status(500).json({ error: "Failed to fetch offers" });
      }
    });

    app.post("/reviews", async (req, res) => {
      try {
        const {
          estateId,
          userName,
          userEmail,
          userProfilePicture,
          reviewText,
        } = req.body;
        const newComment = {
          estateId,
          userName,
          userEmail,
          userProfilePicture,
          reviewText,
          date: new Date(),
        };
        const result = await reviewsCollection.insertOne(newComment);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add comment" });
      }
    });

    app.get("/reviews", async (req, res) => {
      try {
        const { estateId } = req.query;
        const result = await reviewsCollection.find({ estateId }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve comments" });
      }
    });

    app.get("/reviews/user/:email", async (req, res) => {
      const userEmail = req.params.email;
      try {
        const userReviews = await reviewsCollection
          .find({ userEmail })
          .toArray();
        res.status(200).json(userReviews);
      } catch (error) {
        console.error("Failed to fetch user reviews:", error);
        res.status(500).json({ error: "Failed to fetch user reviews" });
      }
    });

    app.delete("/reviews/:reviewId", async (req, res) => {
      const reviewId = req.params.reviewId;
      try {
        const deleteResult = await reviewsCollection.deleteOne({
          _id: new ObjectId(reviewId),
        });
        if (deleteResult.deletedCount === 0) {
          return res.status(404).json({ message: "Review not found" }); // Send 404 for not found
        }
        res.status(200).json({ message: "Review deleted successfully" });
      } catch (error) {
        console.error("Failed to delete review:", error);
        res.status(500).json({ error: "Failed to delete review" });
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
