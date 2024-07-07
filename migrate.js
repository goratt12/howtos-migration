const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const firestore = admin.firestore();

const howtosCollection = process.env.HOWTOS_COLLECTION;
const UsersCollection = process.env.USERS_COLLECTION;

async function migrateHowtos() {
  try {
    // Step 1: Query all documents from the 'howtos' collection where 'creatorCountry', cannot filter out document without the 'creatorCountry' field
    const howtosSnapshot = await firestore.collection(howtosCollection).get();

    // Step 2: Extract '_createdBy' field from each document and create a set of unique users, and filter out documents with creatorCountry
    const userIds = new Set();
    let count = 0;
    howtosSnapshot.forEach((doc) => {
      const docData = doc.data();
      const createdBy = docData._createdBy;
      const creatorCountry = docData.creatorCountry;
      if (!creatorCountry && createdBy) {
        userIds.add(createdBy);
        count++;
      }
    });

    console.log(
      `Found ${count} howtos without 'creatorCountry', linked to ${userIds.size} users`
    );

    // Step 3: Pull all users from the 'users' collection in batches of 30
    const userCountryMap = new Map();
    const userIdArray = Array.from(userIds);
    for (let i = 0; i < userIdArray.length; i += 30) {
      const batch = userIdArray.slice(i, i + 30);
      const userDocs = await firestore
        .collection(UsersCollection)
        .where("userName", "in", batch)
        .get();

      // Populate userCountryMap with userId and country
      userDocs.forEach((doc) => {
        const country = doc.data().country;
        if (country) {
          userCountryMap.set(doc.id, country);
        }
      });
    }

    // Step 5: Update the 'howtos' collection with the 'creatorCountry' field
    const batch = firestore.batch();
    howtosSnapshot.forEach((doc) => {
      const docData = doc.data();
      const createdBy = docData._createdBy;
      const country = userCountryMap.get(createdBy);
      if (country) {
        batch.update(doc.ref, { creatorCountry: country });
        console.log(`${docData._id} : ${createdBy} : ${country}`);
      }
    });

    // Commit the batch update
    await batch.commit();
    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Error during migration:", error);
  }
}

migrateHowtos();

/**
 * Function: migrateHowtos
 * -----------------------
 * This function performs the migration of 'howtos' collection documents in Firebase Firestore
 * by assigning the 'creatorCountry' field based on the 'country' field of users in the 'users' collection.
 *
 * Steps:
 * 1. Query all documents from the 'howtos' collection where 'creatorCountry' is null or an empty string.
 * 2. Extract the '_createdBy' field from each document and create a set of unique user IDs.
 * 3. Retrieve all users from the 'users' collection whose IDs are in the set of user IDs.
 * 4. Create a map of userId to country.
 * 5. Update the 'howtos' collection documents with the 'creatorCountry' field based on the user's country.
 *
 * Error Handling:
 * If any error occurs during the process, it will be logged to the console.
 */
