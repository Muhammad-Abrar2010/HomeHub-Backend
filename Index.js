const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

app.use(express.json());


app.use(cors());

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
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });


    const estateCollection = client.db("estateDB").collection("estate");
    const userCollection = client.db("estateDB").collection("users");
    const wishlistCollection = client.db("estateDB").collection("wishlist");
    const offerCollection = client.db("estateDB").collection("offers");
    const reviewsCollection = client.db("estateDB").collection("reviews");



    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }

      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
     
        next();
      });
    };

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
    app.post("/addProperty", verifyToken, async (req, res) => {
      const {
        property_title,
        property_location,
        property_image,
        agent_name,
        agent_email,
        min_price,
        max_price,
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
          min_price,
          max_price,
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

    app.put(
      "/update-offer-status/:estateId/:offerId",
      verifyToken,
      async (req, res) => {
        const { estateId, offerId } = req.params;
        const { status } = req.body;

        try {
          // Check if the offer exists
          const offer = await offerCollection.findOne({
            _id: new ObjectId(offerId),
            estateId: estateId,
          });
          if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
          }

          // Update the status of the offer
          await offerCollection.updateOne(
            { _id: new ObjectId(offerId) },
            { $set: { status: "bought" } }
          );

          // Optionally, you can update other offers associated with the same estate
          // For example, mark all other offers as "rejected" if this one is "accepted"
          if (status === "accepted") {
            await offerCollection.updateMany(
              { estateId: estateId, _id: { $ne: new ObjectId(offerId) } },
              { $set: { status: "rejected" } }
            );
          }

          res
            .status(200)
            .json({ message: "Offer status updated successfully" });
        } catch (error) {
          console.error("Failed to update offer status:", error);
          res.status(500).json({ error: "Failed to update offer status" });
        }
      }
    );

    app.patch("/rejectProperty/:id", verifyToken, async (req, res) => {
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

    app.patch("/verifyProperty/:id", verifyToken, async (req, res) => {
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

    app.get("/estates/:id", verifyToken, async (req, res) => {
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

    app.put("/updateProperty/:id", verifyToken, async (req, res) => {
      console.log("update property route hitted");
      const propertyId = req.params.id;
      const {
        property_title,
        property_location,
        property_image,
        min_price,
        max_price,
      } = req.body;

      try {
        const updatedProperty = {
          property_title,
          property_location,
          property_image,
          min_price,
          max_price,
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

    app.delete("/deleteProperty/:id", verifyToken, async (req, res) => {
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

    app.get("/properties", verifyToken, async (req, res) => {
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

    app.post("/users", verifyToken, async (req, res) => {
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
    app.get("/users", verifyToken, async (req, res) => {
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
    app.post("/users/:id/make-admin", verifyToken, async (req, res) => {
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
    app.post("/users/:id/make-agent", verifyToken, async (req, res) => {
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

    // // Mark as fraud
    app.post("/users/:id/mark-fraud", verifyToken, async (req, res) => {
      try {
        const userId = req.params.id;

        // Retrieve user information using the provided user ID
        const user = await userCollection.findOne({
          _id: new ObjectId(userId),
        });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const userEmail = user.email;

        // Mark user as fraud
        await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { isFraud: true } }
        );

        // Delete all properties added by the user
        const deletePropertyResult = await estateCollection.deleteMany({
          agent_email: userEmail,
        });

        // Optionally, delete other associated data such as offers, reviews, etc.
        await offerCollection.deleteMany({ buyer_email: userEmail });
        await reviewsCollection.deleteMany({ userEmail: userEmail });

        res.status(200).json({
          message:
            "User marked as fraud and associated data deleted successfully",
          deletedPropertiesCount: deletePropertyResult.deletedCount,
        });
      } catch (error) {
        console.error("Failed to mark user as fraud and delete data:", error);
        res
          .status(500)
          .json({ error: "Failed to mark user as fraud and delete data" });
      }
    });

    // Delete user
    app.delete("/users/:id", verifyToken, async (req, res) => {
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

    app.get("/offers", verifyToken, async (req, res) => {
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

    app.patch("/offers/:id/status", verifyToken, async (req, res) => {
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

    app.post("/reviews", verifyToken, async (req, res) => {
      try {
        const {
          estateId,
          userName,
          userEmail,
          userProfilePicture,
          reviewText,
        } = req.body;

        if (!estateId) {
          return res.status(400).send({ error: "Estate ID is required" });
        }

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
        console.error("Error adding comment:", error);
        res.status(500).send({ error: "Failed to add comment" });
      }
    });

    app.delete("/users/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;

      try {
        // Delete user
        const userDeleteResult = await userCollection.deleteOne({
          email: userEmail,
        });

        if (userDeleteResult.deletedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        // Delete properties associated with the user's email
        const propertyDeleteResult = await estateCollection.deleteMany({
          agent_email: userEmail,
        });

        res.status(200).json({
          message: "User and associated properties deleted successfully",
        });
      } catch (error) {
        console.error("Failed to delete user and properties:", error);
        res.status(500).json({ error: "Failed to delete user and properties" });
      }
    });

    app.get("/reviews/all", verifyToken, async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
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

    app.delete("/reviews/:reviewId", verifyToken, async (req, res) => {
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
    app.delete("/reviews/:reviewId", verifyToken, async (req, res) => {
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

    app.get("/reviews/:id", async (req, res) => {
      const { estateId } = req.query;
      try {
        const result = await reviewsCollection.find({ estateId }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve comments" });
      }
    });
    app.post("/wishlist", verifyToken, async (req, res) => {
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

    app.get("/wishlist/:email", verifyToken, async (req, res) => {
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

    app.delete("/wishlist/:estateId", verifyToken, async (req, res) => {
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

    app.get("/sold-properties/:agentName", verifyToken, async (req, res) => {
      const agentName = req.params.agentName;
      try {
        const soldOffers = await offerCollection
          .find({
            agent_name: agentName,
            status: "bought", // "bought" means the property is sold
          })
          .toArray();

        if (soldOffers.length === 0) {
          return res
            .status(404)
            .json({ message: "No sold properties found for this agent" });
        }

        res.status(200).json(soldOffers);
      } catch (error) {
        console.error("Failed to fetch sold properties:", error);
        res.status(500).json({ error: "Failed to fetch sold properties" });
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
