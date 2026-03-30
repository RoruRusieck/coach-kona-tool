const admin = require("firebase-admin");
const readline = require("readline");

const serviceAccount = require("./firebaseKey.json");
const sessions = require("./tests/Maxime S4 S5.json");

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

		const sessionIds = Object.keys(sessions).map(
			(id) => sessions[id].sessionId || id
		);

		console.log(`🗑 ${sessionIds.length} sessions prévues pour suppression :`);
		sessionIds.forEach((sid) => console.log(`   - ${sid}`));

		const confirm = await askQuestion("⚠ Confirmer la suppression ? (y/n) : ");
		if (confirm.toLowerCase() !== "y") {
			console.log("❌ Suppression annulée.");
			rl.close();
			return;
		}

		for (const sessionId of sessionIds) {
			await sessionsRef.doc(sessionId).delete();
			console.log(`✅ Session supprimée : ${sessionId}`);
		}

		console.log("🏁 Suppression terminée !");
	} catch (err) {
		console.error("❌ Erreur pendant la suppression :", err);
	} finally {
		rl.close();
	}
})();
