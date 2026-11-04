/**
 * Le seuil de la mise à jour obligatoire : `config/app.minVersion` dans Firestore (fiche
 * coach-kona/docs/mise-a-jour-obligatoire/fiche-mise-a-jour.md). Une app sous le seuil de sa
 * plateforme affiche l'écran bloquant, à partir de la 1.38.1 (les versions d'avant ne lisent rien).
 *
 * Avant de monter un seuil (fiche, section 10) : la version doit être disponible à 100 % dans le
 * store de cette plateforme (pas pendant un déploiement progressif sur Google Play), et tourner sur
 * les systèmes encore utilisés.
 *
 * Usage :
 *   node seuil-mise-a-jour.js                                  affiche les seuils
 *   node seuil-mise-a-jour.js --ios=1.38.1 --android=1.38.1    simulation
 *   node seuil-mise-a-jour.js --ios=1.38.1 --apply             écrit (une plateforme suffit)
 */
const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
const APPLY = process.argv.includes("--apply");
const VERSION = /^\d+\.\d+\.\d+$/;

(async () => {
	const ref = db.doc("config/app");
	const actuel = (await ref.get()).data()?.minVersion ?? {};
	console.log("Seuils actuels :", JSON.stringify(actuel));

	const nouveau = { ...actuel };
	for (const p of ["ios", "android"]) {
		const v = arg(p);
		if (v === undefined) continue;
		if (!VERSION.test(v)) throw new Error(`--${p}=${v} : il faut une version X.Y.Z`);
		nouveau[p] = v;
	}
	if (JSON.stringify(nouveau) === JSON.stringify(actuel)) return;

	console.log(`Seuils ${APPLY ? "écrits" : "qui seraient écrits"} :`, JSON.stringify(nouveau));
	if (!APPLY) {
		console.log("Simulation : rien n'est écrit. Ajouter --apply.");
		return;
	}
	await ref.set({ minVersion: nouveau, updatedAt: new Date().toISOString() }, { merge: true });
	console.log("Écrit.");
})()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e.message ?? e);
		process.exit(1);
	});
