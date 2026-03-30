const admin = require("firebase-admin");
const fs = require("fs");
const readline = require("readline");

const serviceAccount = require("./firebaseKey.json");
const sessions = require("./tests/Nicolas S6 S7.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function askQuestion(question) {
	return new Promise((resolve) => rl.question(question, resolve));
}

(async () => {
	try {
		const userId = await askQuestion("👤 Entrez l'userId : ");
		const programId = await askQuestion("📘 Entrez le programId : ");

		const sessionsRef = db
			.collection("users")
			.doc(userId)
			.collection("programs")
			.doc(programId)
			.collection("sessions");

		const sessionIds = Object.keys(sessions);
		console.log(`📦 ${sessionIds.length} sessions à importer…`);

		for (const id of sessionIds) {
			const sessionData = sessions[id];

			if (!sessionData.sessionId) {
				sessionData.sessionId = id;
			}

			await sessionsRef.doc(sessionData.sessionId).set(sessionData);
			console.log(`✅ Session ajoutée : ${sessionData.sessionId}`);
		}

		console.log("🏁 Import terminé !");
	} catch (err) {
		console.error("❌ Erreur pendant l’import :", err);
	} finally {
		rl.close();
	}
})();
