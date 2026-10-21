/**
 * Supprimer un compte après sa demande depuis l'app (profil refait, fiche 09 ; décision Romain du
 * 19/10/2026 : pas de suppression automatique pour commencer). L'app enregistre la demande
 * (`deletionRequestedAt` sur la fiche, fonction `compteSupprimer` de coach-kona-infra) et prévient le
 * salon Discord de la facturation ; on supprime ici, à la main, sous 30 jours (délai annoncé).
 *
 * Effacé, dans cet ordre :
 * 1. la fiche `users/{uid}` et tout ce qu'elle contient (programmes, séances, brouillon du
 *    questionnaire, rapports, données Garmin privées…) ;
 * 2. la conversation `chats/{uid}` et ses messages ;
 * 3. ses idées (`feedbacks`, par `userId`) ;
 * 4. les brouillons en attente de validation (`pendingValidations`, par `athlete_id`) ;
 * 5. l'utilisateur OneSignal, si `ONESIGNAL_API_KEY` est fournie (la demande l'a déjà retiré ; il
 *    revient si la personne s'est reconnectée depuis) ;
 * 6. le compte Firebase Auth, en dernier.
 * Aucune sauvegarde : c'est une demande d'effacement.
 *
 * Reste à faire à la main, rappelé à la fin : le client RevenueCat, Stripe pour un beta, et l'email
 * de confirmation que demande Apple, depuis contact@kona.coach (l'adresse est affichée avant
 * l'effacement, elle n'existe plus après).
 *
 * Pendant l'attente, l'app refuse la session du compte (`coach-kona/services/compteService.ts`).
 *
 * Usage : node supprimer-compte.js <uid> [--apply | --annuler]
 *   Sans option : rien n'est effacé ; affiche ce qui partira, la demande, la dernière connexion.
 *   --apply : efface.
 *   --annuler : retire la demande (la personne a écrit pour annuler) ; elle peut se reconnecter.
 *   Refuse une fiche sans demande de suppression enregistrée (garde-fou contre un mauvais identifiant).
 */
const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const uid = process.argv[2];
const appliquer = process.argv.includes("--apply");
const annuler = process.argv.includes("--annuler");
const ONESIGNAL_APP_ID = "c1b9d514-b98f-4186-a08a-9e6abea70d37";
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

const date = (iso) =>
	iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }) : "—";

/** Le nombre de documents sous un document, sous-collections comprises. */
async function compterSous(ref) {
	let total = 0;
	for (const col of await ref.listCollections()) {
		const docs = await col.listDocuments();
		total += docs.length;
		for (const d of docs) total += await compterSous(d);
	}
	return total;
}

async function main() {
	if (!uid || uid.startsWith("--") || (appliquer && annuler)) {
		console.error("Usage : node supprimer-compte.js <uid> [--apply | --annuler]");
		process.exit(1);
	}

	const ficheRef = db.doc(`users/${uid}`);
	const fiche = await ficheRef.get();
	const donnees = fiche.exists ? fiche.data() : {};
	let compteAuth = null;
	try {
		compteAuth = await admin.auth().getUser(uid);
	} catch (e) {
		if (e.code !== "auth/user-not-found") throw e;
	}

	if (!fiche.exists && !compteAuth) {
		console.log(`Rien à supprimer : ni fiche ni compte pour ${uid}.`);
		return;
	}
	// Garde-fou contre un identifiant mal recopié. Sans fiche, la demande n'a pas pu s'y écrire (la
	// fonction n'en crée pas) : seul le compte de connexion reste, rien à protéger.
	if (fiche.exists && !donnees.deletionRequestedAt) {
		console.error(`Refusé : aucune demande de suppression enregistrée sur la fiche de ${uid}.`);
		process.exit(1);
	}

	if (annuler) {
		if (!fiche.exists) {
			console.error(`Rien à annuler : pas de fiche pour ${uid}.`);
			process.exit(1);
		}
		await ficheRef.update({ deletionRequestedAt: admin.firestore.FieldValue.delete() });
		console.log(`Demande annulée pour ${uid} (${donnees.email ?? compteAuth?.email ?? "sans email"}).`);
		console.log("  La personne peut se reconnecter ; OneSignal se relie à sa prochaine connexion.");
		console.log("  Lui répondre depuis contact@kona.coach que c'est fait.");
		return;
	}

	const derniereConnexion = compteAuth?.metadata?.lastRefreshTime ?? compteAuth?.metadata?.lastSignInTime ?? null;
	const revenuDepuis = derniereConnexion && new Date(derniereConnexion) > new Date(donnees.deletionRequestedAt);
	const email = donnees.email ?? compteAuth?.email ?? null;

	const chatRef = db.doc(`chats/${uid}`);
	const idees = await db.collection("feedbacks").where("userId", "==", uid).get();
	const enAttente = await db.collection("pendingValidations").where("athlete_id", "==", uid).get();

	console.log(`Compte ${uid}`);
	console.log(`  ${[donnees.firstname, donnees.lastname].filter(Boolean).join(" ") || "(sans nom)"} · ${email ?? "(sans email)"}`);
	console.log(`  Demande de suppression : ${fiche.exists ? date(donnees.deletionRequestedAt) : "— (pas de fiche)"}`);
	console.log(`  Dernière connexion     : ${date(derniereConnexion)}${revenuDepuis ? "  ⚠️ APRÈS la demande : la personne a essayé de revenir (l'app lui a refusé la session)" : ""}`);
	console.log("Ce qui part :");
	console.log(`  fiche users/${uid} : ${fiche.exists ? `oui, + ${await compterSous(ficheRef)} documents dessous` : "absente"}`);
	console.log(`  conversation chats/${uid} : ${(await chatRef.get()).exists ? `oui, + ${await compterSous(chatRef)} documents dessous` : "absente"}`);
	console.log(`  idées : ${idees.size}`);
	console.log(`  brouillons en attente de validation : ${enAttente.size}`);
	console.log(`  OneSignal : ${ONESIGNAL_API_KEY ? "oui" : "non (ONESIGNAL_API_KEY absente ; retiré à la demande)"}`);
	console.log(`  compte de connexion : ${compteAuth ? "oui" : "déjà absent"}`);

	if (!appliquer) {
		console.log("\nSimulation : rien n'est effacé. Relancer avec --apply.");
		return;
	}

	await db.recursiveDelete(ficheRef);
	await db.recursiveDelete(chatRef);
	await Promise.all(idees.docs.map((d) => d.ref.delete()));
	await Promise.all(enAttente.docs.map((d) => d.ref.delete()));
	if (ONESIGNAL_API_KEY) {
		const reponse = await fetch(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${uid}`, {
			method: "DELETE",
			headers: { Authorization: ONESIGNAL_API_KEY },
		});
		// Un utilisateur inconnu de OneSignal (404) n'empêche rien.
		if (!reponse.ok && reponse.status !== 404) console.error(`OneSignal : ${reponse.status} ${await reponse.text()}`);
	}
	if (compteAuth) await admin.auth().deleteUser(uid);

	console.log(`\nSupprimé : ${uid}.`);
	console.log("Reste à faire à la main :");
	console.log(`  1. RevenueCat : supprimer le client ${uid} (Customer → Delete customer).`);
	console.log("  2. Stripe, si c'était un abonné beta : arrêter l'abonnement.");
	console.log(`  3. Email de confirmation à ${email ?? "(adresse inconnue)"}, depuis contact@kona.coach.`);
}

main().then(
	() => process.exit(0),
	(e) => {
		console.error(e);
		process.exit(1);
	},
);
