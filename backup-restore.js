const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Récupérer tous les documents et leurs sous-collections
 */
async function getCollectionRecursive(collectionRef) {
	const snapshot = await collectionRef.get();
	const data = {};

	for (const doc of snapshot.docs) {
		const docData = doc.data();

		// Récupérer les sous-collections
		const subCollections = await doc.ref.listCollections();
		if (subCollections.length > 0) {
			docData.__subcollections__ = {};
			for (const subCol of subCollections) {
				docData.__subcollections__[subCol.id] = await getCollectionRecursive(
					subCol
				);
			}
		}

		data[doc.id] = docData;
	}

	return data;
}

/**
 * Backup complet
 */
async function backupFirestore(filename = "firestore-backup.json") {
	const backupData = {};
	const collections = await db.listCollections();

	for (const collection of collections) {
		backupData[collection.id] = await getCollectionRecursive(collection);
	}

	fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
	console.log(`Backup terminé dans ${filename}`);
}

/**
 * Reconvertit les Timestamps sérialisés { seconds, nanoseconds } en admin.firestore.Timestamp
 */
function deserializeTimestamps(data) {
	if (data === null || data === undefined) return data;

	if (Array.isArray(data)) {
		return data.map(deserializeTimestamps);
	}

	if (typeof data === "object") {
		if (typeof data.seconds === "number" && typeof data.nanoseconds === "number") {
			return new admin.firestore.Timestamp(data.seconds, data.nanoseconds);
		}

		const result = {};
		for (const [key, value] of Object.entries(data)) {
			result[key] = deserializeTimestamps(value);
		}
		return result;
	}

	return data;
}

/**
 * Restauration complète
 */
async function restoreCollection(collectionRef, data) {
	for (const [docId, docData] of Object.entries(data)) {
		if (!docData || typeof docData !== "object") continue;

		const subCollections = docData.__subcollections__ || {};
		const fields = { ...docData };
		delete fields.__subcollections__;

		await collectionRef.doc(docId).set(deserializeTimestamps(fields));

		// Restaurer les sous-collections
		for (const [subColName, subColData] of Object.entries(subCollections)) {
			await restoreCollection(
				collectionRef.doc(docId).collection(subColName),
				subColData
			);
		}
	}
}

async function restoreFirestore(filename = "firestore-backup.json") {
	const backupData = JSON.parse(fs.readFileSync(filename, "utf-8"));

	for (const [collectionName, collectionData] of Object.entries(backupData)) {
		await restoreCollection(db.collection(collectionName), collectionData);
	}

	console.log("Restauration terminée !");
}

// CLI
const action = process.argv[2]; // "backup" ou "restore"
const file = process.argv[3] || "firestore-backup.json";

if (action === "backup") {
	backupFirestore(file);
} else if (action === "restore") {
	restoreFirestore(file);
} else {
	console.log("Usage: node backup-restore.js <backup|restore> [filename]");
}
