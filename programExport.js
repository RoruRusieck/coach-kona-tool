const admin = require("firebase-admin");
const fs = require("fs");
const readline = require("readline");

const serviceAccount = require("./oldBase.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function getSubcollectionsData(docRef) {
	const result = {};
	const subcollections = await docRef.listCollections();

	for (const subCol of subcollections) {
		const subColSnap = await subCol.get();
		const subColData = {};

		subColSnap.forEach((doc) => {
			subColData[doc.id] = doc.data();
		});

		result[subCol.id] = subColData;
	}

	return result;
}

rl.question("🔐 Entrez le userId à exporter : ", async (userId) => {
	try {
		const programsRef = db
			.collection("users")
			.doc(userId)
			.collection("programs");
		const programsSnap = await programsRef.get();

		if (programsSnap.empty) {
			console.log("❌ Aucun programme trouvé pour cet utilisateur.");
			rl.close();
			return;
		}

		const exportData = {};

		for (const programDoc of programsSnap.docs) {
			const programData = programDoc.data();
			const subcollections = await getSubcollectionsData(programDoc.ref);

			exportData[programDoc.id] = {
				...programData,
				...subcollections,
			};
		}

		const outputPath = `export_user_${userId}_programs_full.json`;
		fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

		console.log(`✅ Export terminé. Fichier : ${outputPath}`);
	} catch (err) {
		console.error("❌ Erreur pendant l’export :", err);
	} finally {
		rl.close();
	}
});
