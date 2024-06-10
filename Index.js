const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

    app.post("/create-payment-intent", async (req, res) => {
      const { amount, email } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          receipt_email: email,
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

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
        price_range,
        agent_image,
      } = req.body;

      try {
        const newProperty = {
          property_title,
          property_location,
          property_image,
          agent_name,
          agent_email,
          verification_status: "pending",
          price_range,
          agent_image,
          createdAt: new Date(),
        };

        const result = await estateCollection.insertOne(newProperty);
        res.status(201).json({
          message: "Property added successfully",
          propertyId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to add property:", error);
        res.status(500).json({ error: "Failed to add property" });
      }
    });

    app.patch("/rejectProperty/:id", async (req, res) => {
      const propertyId = req.params.id;

      try {
        const result = await estateCollection.updateOne(
          { _id: new ObjectId(propertyId) },
          { $set: { verification_status: "rejected" } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.status(200).json({ message: "Property rejected successfully" });
      } catch (error) {
        console.error("Failed to reject property:", error);
        res.status(500).json({ error: "Failed to reject property" });
      }
    });

    app.patch("/verifyProperty/:id", async (req, res) => {
      const propertyId = req.params.id;

      try {
        const result = await estateCollection.updateOne(
          { _id: new ObjectId(propertyId) },
          { $set: { verification_status: "verified" } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.status(200).json({ message: "Property verified successfully" });
      } catch (error) {
        console.error("Failed to verify property:", error);
        res.status(500).json({ error: "Failed to verify property" });
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

    app.put("/update-offer-status/:estateId", async (req, res) => {
      const estateId = req.params.estateId;
      const { status, transactionId } = req.body;

      try {
        // Update the status of the offer
        const result = await offerCollection.updateOne(
          { estateId: new ObjectId(estateId), status: "accepted" }, // Find the accepted offer for the given estateId
          { $set: { status, transactionId } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Offer not found" });
        }

        // Update the property status to 'bought'
        const propertyResult = await estateCollection.updateOne(
          { _id: new ObjectId(estateId) },
          { $set: { status: "bought" } }
        );

        if (propertyResult.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res
          .status(200)
          .json({ message: "Offer and property status updated successfully" });
      } catch (error) {
        console.error("Failed to update offer and property status:", error);
        res
          .status(500)
          .json({ error: "Failed to update offer and property status" });
      }
    });

    app.delete("/deleteProperty/:id", async (req, res) => {
      const propertyId = req.params.id;

      try {
        const result = await estateCollection.deleteOne({
          _id: new ObjectId(propertyId),
        });

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
        const properties = await estateCollection
          .find({ agent_email: agentEmail })
          .toArray();
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

    // Fetch all users
    app.get("/users", async (req, res) => {
      try {
        const users = await client
          .db("estateDB")
          .collection("users")
          .find()
          .toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve users" });
      }
    });

    // Make a user admin
    app.post("/users/:id/make-admin", async (req, res) => {
      try {
        const userId = req.params.id;
        const result = await client
          .db("estateDB")
          .collection("users")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: { role: "admin" } }
          );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to make user admin" });
      }
    });

    // Make a user agent
    app.post("/users/:id/make-agent", async (req, res) => {
      try {
        const userId = req.params.id;
        const result = await client
          .db("estateDB")
          .collection("users")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: { role: "agent" } }
          );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to make user agent" });
      }
    });

    // Mark as fraud
    app.post("/users/:id/mark-fraud", async (req, res) => {
      try {
        const userId = req.params.id;
        const result = await client
          .db("estateDB")
          .collection("users")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: { isFraud: true } }
          );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to mark user as fraud" });
      }
    });

    // Delete user
    app.delete("/users/:id", async (req, res) => {
      try {
        const userId = req.params.id;
        const result = await client
          .db("estateDB")
          .collection("users")
          .deleteOne({ _id: new ObjectId(userId) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete user" });
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

        const priceRange = estate.price_range;

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

    app.patch("/offers/:id/status", async (req, res) => {
      const offerId = req.params.id;
      const { status } = req.body;

      try {
        const offer = await offerCollection.findOne({
          _id: new ObjectId(offerId),
        });
        if (!offer) {
          return res.status(404).json({ message: "Offer not found" });
        }

        if (status === "accepted") {
          await offerCollection.updateOne(
            { _id: new ObjectId(offerId) },
            { $set: { status: "accepted" } }
          );

          await offerCollection.updateMany(
            { estateId: offer.estateId, _id: { $ne: new ObjectId(offerId) } },
            { $set: { status: "rejected" } }
          );
        } else if (status === "rejected") {
          await offerCollection.updateOne(
            { _id: new ObjectId(offerId) },
            { $set: { status: "rejected" } }
          );
        }

        res.status(200).json({ message: "Offer status updated" });
      } catch (error) {
        console.error("Failed to update offer status:", error);
        res.status(500).json({ error: "Failed to update offer status" });
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

    // app.get("/reviews", async (req, res) => {
    //   try {
    //     const { estateId } = req.query;

    //     const result = await reviewsCollection.find({ estateId }).toArray();
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ error: "Failed to retrieve comments" });
    //   }
    // });

    app.get("/reviews", async (req, res) => {
      try {
        console.log("Fetching reviews..."); // Add this line
        const result = await reviewsCollection.find().toArray();
        console.log("Reviews fetched:", result); // Add this line
        res.send(result);
      } catch (error) {
        console.error("Failed to retrieve reviews:", error);
        res.status(500).send({ error: "Failed to retrieve reviews" });
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

    app.get("/reviews", async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve comments" });
      }
    });

    // Delete a review by ID
    app.delete("/reviews/:reviewId", async (req, res) => {
      const reviewId = req.params.reviewId;
      try {
        const deleteResult = await reviewsCollection.deleteOne({
          _id: new ObjectId(reviewId),
        });
        if (deleteResult.deletedCount === 0) {
          return res.status(404).json({ message: "Review not found" });
        }
        res.status(200).json({ message: "Review deleted successfully" });
      } catch (error) {
        console.error("Failed to delete review:", error);
        res.status(500).json({ error: "Failed to delete review" });
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
  } catch (error) {
    console.error(error);
  }
}

app.listen(port, () => {
  console.log(`Home Hub Server Running on port ${port}`);
});

run().catch(console.dir);
