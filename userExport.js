const admin = require("firebase-admin");
const fs = require("fs");
const readline = require("readline");

const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function exportDocumentDataRecursively(docRef) {
	const data = {};
	const docSnap = await docRef.get();

	if (docSnap.exists) {
		Object.assign(data, docSnap.data());
	}

	// const subcollections = await docRef.listCollections();
	// for (const subCol of subcollections) {
	// 	data[subCol.id] = {};

	// 	const subDocsSnap = await subCol.get();
	// 	for (const subDoc of subDocsSnap.docs) {
	// 		data[subCol.id][subDoc.id] = await exportDocumentDataRecursively(
	// 			subDoc.ref
	// 		);
	// 	}
	// }

	return data;
}

rl.question("🔐 Entrez le userId à exporter : ", async (userId) => {
	try {
		console.log("📦 Export en cours...");

		const userDocRef = db.collection("users").doc(userId);
		const exportData = await exportDocumentDataRecursively(userDocRef);

		const outputPath = `./users/${userId}.json`;
		fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

		console.log(`✅ Export terminé. Fichier : ${outputPath}`);
	} catch (err) {
		console.error("❌ Erreur pendant l’export :", err);
	} finally {
		rl.close();
	}
});
