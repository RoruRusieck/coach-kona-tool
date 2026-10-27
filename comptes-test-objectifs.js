/**
 * Les comptes de test de Ben pour la refonte d'Objectifs (28/10/2026) : un compte par situation de
 * `set-test-objectifs.js`, chacun avec un profil v2 complet, l'accès offert et un programme à étapes
 * (clones du compte de test de Romain, sans ses données propres).
 *
 * Effets de bord à la création, connus et acceptés :
 * - `notifyOnNewUser` poste « Nouvelle création de compte » sur Discord, une fois par compte ;
 * - `notifyOnNewProgram` poste le programme sur Discord, une fois par compte. Pas de tag OneSignal
 *   ni d'event GA4 (`firstProgramDeliveredAt` posé avant), pas de notification (« Ton programme »
 *   coupé le temps de la création, puis remis).
 * Les séances sont toutes « planifiées » : sans séance validée depuis 30 jours, un compte à accès
 * offert n'entre ni dans l'analyse RPE ni dans les alertes de renouvellement de Ben.
 *
 * Usage :
 *   node comptes-test-objectifs.js [--apply]              crée les comptes (simulation sans --apply)
 *   node comptes-test-objectifs.js --supprimer [--apply]  supprime les comptes et leurs données
 *
 * Les adresses sont des alias de Ben (« + ») : elles sont exclues des chiffres. Le mot de passe,
 * commun, est affiché à la création et n'est écrit nulle part.
 */
const admin = require("firebase-admin");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const APPLY = process.argv.includes("--apply");
const SUPPRIMER = process.argv.includes("--supprimer");

const SOURCE_UID = "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const SOURCE_PROGRAMME = "romain_20261012_7391";
const SITUATIONS = ["avant", "lendemain", "releve", "majeure-apres", "base", "sansdate", "finir"];
const email = (s) => `ben.coachkona+objectifs-${s}@gmail.com`;

/** Les champs du profil repris du compte de Romain : le sportif, pas la personne ni son historique. */
const CHAMPS_PROFIL = [
	"acceptConditions",
	"averageSleepPerNightHours",
	"club",
	"coachingExpectations",
	"currentWeeklyTrainingSessions",
	"equipment",
	"language",
	"maxTrainingHoursPerDay",
	"metrics",
	"metricsHistory",
	"onboardingVersion",
	"preferredRestDay",
	"profile",
	"swimDays",
	"targetMaxWeeklyTrainingHours",
	"targetWeeklyTrainingSessions",
	"trainingStartDate",
	"triathlonExperience",
	"unitSystem",
];

/** Ce que garde une séance clonée : le contenu, sans le retour de Romain. */
const CHAMPS_SEANCE_RETIRES = ["perceivedEffort", "perceivedCondition", "comment", "validatedAt", "completedAt", "garmin", "garminWorkoutId"];

const supprimer = async () => {
	for (const s of SITUATIONS) {
		let u;
		try {
			u = await auth.getUserByEmail(email(s));
		} catch {
			console.log(`${s} : aucun compte`);
			continue;
		}
		console.log(`${s} : ${u.uid} ${APPLY ? "supprimé" : "serait supprimé"}`);
		if (!APPLY) continue;
		await db.recursiveDelete(db.collection("users").doc(u.uid));
		await db.recursiveDelete(db.collection("chats").doc(u.uid));
		const pendings = await db.collection("pendingValidations").where("athlete_id", "==", u.uid).get();
		for (const p of pendings.docs) await p.ref.delete();
		await auth.deleteUser(u.uid);
	}
};

const creer = async () => {
	const source = (await db.doc(`users/${SOURCE_UID}`).get()).data();
	const programme = (await db.doc(`users/${SOURCE_UID}/programs/${SOURCE_PROGRAMME}`).get()).data();
	const seances = (await db.collection(`users/${SOURCE_UID}/programs/${SOURCE_PROGRAMME}/sessions`).get()).docs;
	if (!source || !programme) throw new Error("Compte ou programme source introuvable");
	const motDePasse = `Kona-${crypto.randomBytes(4).toString("hex")}`;
	const maintenant = new Date().toISOString();
	const comptes = [];

	for (const s of SITUATIONS) {
		const adresse = email(s);
		let existe = null;
		try {
			existe = await auth.getUserByEmail(adresse);
		} catch {}
		if (existe) {
			console.log(`${s} : existe déjà (${existe.uid}), ignoré`);
			continue;
		}
		const nomSituation = s.charAt(0).toUpperCase() + s.slice(1);
		console.log(`${s} : ${adresse}, programme cloné (${(programme.cycles ?? []).length} étapes, ${seances.length} séances)`);
		if (!APPLY) continue;

		const u = await auth.createUser({ email: adresse, password: motDePasse, emailVerified: true, displayName: `Test ${nomSituation}` });
		const fiche = Object.fromEntries(CHAMPS_PROFIL.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
		await db.doc(`users/${u.uid}`).set({
			...fiche,
			uid: u.uid,
			email: adresse,
			firstname: "Test",
			lastname: nomSituation,
			role: "USER",
			asCompleteForm: true,
			emailVerified: true,
			emailMarketingConsent: false,
			carouselCompletedAt: maintenant,
			onboardingFormStartedAt: maintenant,
			formCompletedAt: maintenant,
			subscription: { hasManualAccess: true },
			// Pas de tag OneSignal ni d'event GA4 à la création du programme ; pas de notification.
			firstProgramDeliveredAt: admin.firestore.Timestamp.now(),
			notificationPreferences: { program: false },
			triathlonGoals: { primary: null, secondary: [], archives: { primary: [], secondary: [] } },
		});

		const idProgramme = `test_objectifs_${s.replace(/-/g, "_")}`;
		const ref = db.doc(`users/${u.uid}/programs/${idProgramme}`);
		const batch = db.batch();
		batch.set(ref, { ...programme, programId: idProgramme, slug: idProgramme });
		for (const d of seances) {
			const x = { ...d.data(), status: "PLANNED" };
			for (const k of CHAMPS_SEANCE_RETIRES) delete x[k];
			batch.set(ref.collection("sessions").doc(d.id), x);
		}
		await batch.commit();

		// La situation d'Objectifs, par le script du compte de test.
		execFileSync("node", [path.join(__dirname, "set-test-objectifs.js"), s, `--uid=${u.uid}`, "--apply"], { stdio: "ignore" });
		comptes.push({ situation: s, email: adresse, uid: u.uid });
	}

	if (!APPLY) {
		console.log("\nSimulation : rien n'est créé. Ajouter --apply.");
		return;
	}
	// « Ton programme » remis par défaut, une fois `notifyOnNewProgram` passé sur chaque programme.
	await new Promise((r) => setTimeout(r, 15000));
	for (const c of comptes) await db.doc(`users/${c.uid}`).update({ notificationPreferences: {} });
	console.log(`\nMot de passe commun : ${motDePasse}`);
	for (const c of comptes) console.log(`${c.situation.padEnd(14)} ${c.email}  (${c.uid})`);
};

(SUPPRIMER ? supprimer() : creer())
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
