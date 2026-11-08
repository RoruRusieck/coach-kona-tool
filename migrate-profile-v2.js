/**
 * Bascule la fiche d'un compte v1 en v2 (zoro : projects/prompts-v2/bascule-comptes-existants.md).
 * Écrit seulement ce que la v2 lit et que la fiche n'a pas, déduit de la fiche ; ne supprime rien,
 * ne touche ni au programme ni à `asCompleteForm` (qui déclencherait la génération). `onboardingVersion: 2`
 * est écrit en dernier, dans une seconde écriture. 08/10/2026, compte pilote.
 *
 * Usage : node migrate-profile-v2.js <uid> [--start=AAAA-MM-JJ] [--apply]
 * Sans --apply : affiche ce qui serait écrit, n'écrit rien. Faire une sauvegarde avant (backup-user.js).
 */
const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const uid = process.argv[2];
const apply = process.argv.includes("--apply");
const start = process.argv.find((a) => a.startsWith("--start="))?.slice(8);
if (!uid || uid.startsWith("--")) {
	console.error("Usage : node migrate-profile-v2.js <uid> [--start=AAAA-MM-JJ] [--apply]");
	process.exit(1);
}
if (start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || new Date(`${start}T12:00:00Z`).getUTCDay() !== 1)) {
	console.error(`--start doit être un lundi au format AAAA-MM-JJ (reçu : ${start})`);
	process.exit(1);
}

const { deductionsV2 } = require("./migration/profil-v2");

(async () => {
	const ref = db.collection("users").doc(uid);
	const u = (await ref.get()).data();
	if (!u) throw new Error(`Aucun doc users/${uid}`);
	if (u.onboardingVersion === 2) {
		console.log("Déjà en v2 : rien à faire.");
		process.exit(0);
	}

	const { maj, inconnu } = deductionsV2(u, { start });
	const xp = u.triathlonExperience ?? {};
	const p = u.triathlonGoals?.primary;

	console.log(`Compte ${uid} (${u.firstname ?? "?"}) — ${apply ? "ÉCRITURE" : "SIMULATION, rien n'est écrit"}`);
	console.log("Avant :", JSON.stringify({ language: u.language, triathlonsCompleted: xp.triathlonsCompleted, triathlonsCompletedRange: xp.triathlonsCompletedRange, swimDays: u.swimDays, goalType: p?.goalType, timeGoals: p?.timeGoals, trainingStartDate: u.trainingStartDate, asCompleteForm: u.asCompleteForm }));
	console.log("1. écrit :", JSON.stringify(maj));
	console.log("2. puis  :", JSON.stringify({ onboardingVersion: 2 }));
	for (const x of inconnu) console.log("  ⚠", x);

	if (!apply) {
		console.log("\nRelancer avec --apply pour écrire.");
		process.exit(0);
	}
	if (Object.keys(maj).length) await ref.update(maj);
	await ref.update({ onboardingVersion: 2 });

	const apres = (await ref.get()).data();
	console.log("Après :", JSON.stringify({ language: apres.language, triathlonsCompletedRange: apres.triathlonExperience?.triathlonsCompletedRange, swimDays: apres.swimDays, goalType: apres.triathlonGoals?.primary?.goalType, trainingStartDate: apres.trainingStartDate, onboardingVersion: apres.onboardingVersion, asCompleteForm: apres.asCompleteForm }));
	process.exit(0);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
