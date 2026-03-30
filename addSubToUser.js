const admin = require("firebase-admin");

const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function addSubscriptionToUsers() {
	const usersRef = db.collection("users");
	const snapshot = await usersRef.get();

	console.log(`Found ${snapshot.size} users.`);

	let batch = db.batch();
	let count = 0;

	snapshot.forEach((doc) => {
		const docRef = doc.ref;

		const subscription = {
			hasAccess: true,
			source: "stripe",
			isBeta: true,
		};

		batch.update(docRef, { subscription });

		count++;

		// Commit batch tous les 500 documents (limite Firestore)
		if (count % 500 === 0) {
			batch.commit();
			batch = db.batch();
		}
	});

	// Commit le batch restant
	await batch.commit();

	console.log(`Updated ${count} users with subscription field.`);
}

addSubscriptionToUsers().catch(console.error);
