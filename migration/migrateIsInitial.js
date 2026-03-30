const admin = require("firebase-admin");

const serviceAccount = require("../keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateIsInitial() {
	try {
		const usersSnapshot = await db.collection("users").get();

		let updatedCount = 0;
		for (const userDoc of usersSnapshot.docs) {
			const userData = userDoc.data();

			if (userData.triathlonGoals?.primary) {
				await userDoc.ref.update({
					"triathlonGoals.primary.isInitial": true,
				});
				updatedCount++;
				console.log(`✓ Updated user: ${userDoc.id}`);
			}
		}

		console.log(`\n✅ Migration complete! Updated ${updatedCount} users`);
		process.exit(0);
	} catch (error) {
		console.error("❌ Migration failed:", error);
		process.exit(1);
	}
}

migrateIsInitial();
