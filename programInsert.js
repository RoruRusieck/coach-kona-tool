const admin = require("firebase-admin");
const fs = require("fs");
const readline = require("readline");

const serviceAccount = require("./migrateTestKey.json");
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const data = JSON.parse(fs.readFileSync("./programs/Beny S3.json", "utf8"));

async function promptUserIdAndImport() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.question(
		"➡️ Entrez le user id firebase du destinataire : ",
		async (userId) => {
			rl.close();
			await importProgramsForUser(userId);
		}
	);
}

async function importProgramsForUser(userId) {
	const programs = data.programs;

	for (const [programId, programData] of Object.entries(programs)) {
		const { sessions, ...programFields } = programData;

		const programRef = db
			.collection("users")
			.doc(userId)
			.collection("programs")
			.doc(programId);

		await programRef.set(programFields);

		if (sessions) {
			for (const [sessionId, sessionData] of Object.entries(sessions)) {
				await programRef.collection("sessions").doc(sessionId).set(sessionData);
			}
		}
	}

	console.log(
		`✅ Programmes importés avec succès pour l'utilisateur "${userId}"`
	);
}

promptUserIdAndImport();
