// Écrit sur le compte de test le message d'un programme validé sans son message (validation rapide du
// dashboard, bug corrigé le 25/10/2026 sur feature/refonte-messages du back-office). Le message est
// celui de la validation, avec sa nature et la période livrée, comme `integrationMessages` l'écrit.
//
// Compte de test seulement (garde sur l'email). Déclenche la notification push du message
// (notifyOnNewMessage). Identifiant fixe : relancer ne crée pas de doublon.
//
// Usage : node envoyer-message-programme-test.js <pendingId> [--apply]

const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const UID = "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const COACH = "igRDQXYLU4SryOuLX7uoHqBtKQ22";
const pendingId = process.argv[2];
const APPLY = process.argv.includes("--apply");

async function main() {
	if (!pendingId || pendingId.startsWith("--")) throw new Error("pendingId manquant");
	const user = (await db.collection("users").doc(UID).get()).data();
	if (!user || user.email !== "rusiecki.romain@gmail.com") throw new Error("ce n'est pas le compte de test attendu");

	const p = (await db.collection("pendingValidations").doc(pendingId).get()).data();
	if (!p || p.athlete_id !== UID || p.type !== "program") throw new Error("validation de programme du compte de test introuvable");
	const texte = typeof p.payload?.message === "string" ? p.payload.message.trim() : "";
	if (!texte) throw new Error("pas de message dans la validation");

	// Période livrée : du premier au dernier jour des séances validées (comme le back-office).
	const programme = p.payload.program && typeof p.payload.program === "object" ? p.payload.program : p.payload;
	const dates = Object.values(programme.sessions ?? {})
		.map((s) => (typeof s?.date === "string" ? s.date.slice(0, 10) : null))
		.filter(Boolean)
		.sort();
	if (!dates.length) throw new Error("aucune séance datée dans la validation");
	const cycle = { startDate: dates[0], endDate: dates[dates.length - 1] };

	// Livraison si aucune séance déjà en base n'est datée d'avant la période.
	let renouvellement = false;
	for (const prog of (await db.collection("users").doc(UID).collection("programs").get()).docs) {
		const avant = await prog.ref.collection("sessions").where("date", "<", cycle.startDate).limit(1).get();
		if (!avant.empty) renouvellement = true;
	}
	const kind = renouvellement ? "program_renewal" : "program_first";

	console.log(`${kind} · ${cycle.startDate} → ${cycle.endDate} · ${texte.length} caractères`);
	console.log(texte.slice(0, 200).replace(/\n/g, " ") + "…");
	if (!APPLY) {
		console.log("\nÀ blanc : rien n'a été écrit. Relancer avec --apply.");
		return;
	}

	await db
		.collection("chats")
		.doc(UID)
		.collection("messages")
		.doc(`programme-${pendingId}`)
		.set({ text: texte, senderId: COACH, seen: false, createdAt: admin.firestore.Timestamp.now(), kind, cycle });
	console.log("\nMessage écrit.");
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
