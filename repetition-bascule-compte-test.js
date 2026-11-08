/**
 * Répétition générale de la bascule Friel sur le compte de test de Romain (demandée par Romain le 08/11/2026 ;
 * zoro : projects/prompts-v2/candidats/2026-11-friel/paquet-prod/README.md). Remet le compte dans l'état d'un abonné
 * v1 : fiche de l'ancien formulaire, programme de l'ancien moteur. Ensuite, on le bascule comme un vrai abonné
 * (migrate-profiles-v2-lot.js --uid=…) et on lance un renouvellement jusqu'au BO.
 *
 * Ce que ça change, et seulement sur le compte de test (l'uid est fixé ici) :
 * - fiche : retire `onboardingVersion`, `swimDays`, `language`, `triathlonsCompletedRange`, `goalType` ; écrit
 *   `triathlonsCompleted` (nombre) et `preferredSessionsByDay` (disciplines par jour), comme l'ancien formulaire ;
 * - programme ouvert : étapes aux titres libres de l'ancien moteur (« Cycle 2 : Fondation aérobie »), sans `periode`,
 *   et sans `squelette` ni `prepas`. Les séances ne sont pas touchées.
 * `asCompleteForm` n'est pas touché (sa remise à vrai déclencherait une génération).
 *
 * Usage :
 *   node repetition-bascule-compte-test.js                       simulation, rien n'est écrit
 *   node repetition-bascule-compte-test.js --apply               écrit, après sauvegarde des champs touchés
 *   node repetition-bascule-compte-test.js --restaurer=<fichier> [--apply]   remet le compte comme avant
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");
const { valeurA } = require("./migration/profil-v2");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const UID = "vDF1OPD8QUbCUkGKRkFcfmz8kRw2"; // compte de test de Romain, et lui seul
const APPLY = process.argv.includes("--apply");
const RESTAURER = process.argv.find((a) => a.startsWith("--restaurer="))?.slice(12);
const ABSENT = "__absent__";

const TITRES_V1 = { prep: "Reprise et tests", base1: "Fondation aérobie 1", base2: "Fondation aérobie 2", base3: "Fondation aérobie 3", build1: "Construction spécifique", build2: "Spécifique avancé", peak: "Pré-compétition", race: "Semaine de course", transition: "Récupération" };
const DISCIPLINES_V1 = ["cycling", "running"];

const avantDe = (objet, champs) => Object.fromEntries(champs.map((c) => [c, valeurA(objet, c) === undefined ? ABSENT : valeurA(objet, c)]));

const preparer = async () => {
	const userRef = db.collection("users").doc(UID);
	const u = (await userRef.get()).data();
	const ps = await userRef.collection("programs").where("status", "==", "OPEN").limit(1).get();
	if (ps.empty) throw new Error("Pas de programme ouvert sur le compte de test.");
	const progRef = ps.docs[0].ref;
	const p = ps.docs[0].data();

	// Fiche : l'ancien formulaire. Le nombre de triathlons, déduit de la tranche ; la natation, les jours de swimDays.
	const tranche = u.triathlonExperience?.triathlonsCompletedRange;
	const nombre = { 0: 0, "1-3": 2, "4-10": 6, "10+": 12 }[tranche] ?? 2;
	const joursNat = Array.isArray(u.swimDays) ? u.swimDays : [];
	const jours = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].filter((j) => j !== u.preferredRestDay);
	const parJour = Object.fromEntries(jours.map((j) => [j, [...(joursNat.includes(j) ? ["swimming"] : []), ...DISCIPLINES_V1]]));
	const majUser = {
		onboardingVersion: FieldValue.delete(),
		swimDays: FieldValue.delete(),
		language: FieldValue.delete(),
		"triathlonExperience.triathlonsCompletedRange": FieldValue.delete(),
		"triathlonGoals.primary.goalType": FieldValue.delete(),
		"triathlonExperience.triathlonsCompleted": nombre,
		preferredSessionsByDay: parJour,
	};

	// Programme : les étapes de l'ancien moteur.
	const cycles = (p.cycles ?? []).map((c, i) => {
		const { periode, ...reste } = c;
		return { ...reste, title: `Cycle ${i + 1} : ${TITRES_V1[periode] ?? String(c.title).replace(/^Cycle \d+ : /, "")}` };
	});
	const majProg = { cycles, squelette: FieldValue.delete(), prepas: FieldValue.delete() };

	console.log(`${APPLY ? "ÉCRITURE" : "SIMULATION, rien n'est écrit"} — compte de test ${UID}, programme ${progRef.id}`);
	console.log("Fiche :", JSON.stringify({ retire: ["onboardingVersion", "swimDays", "language", "triathlonsCompletedRange", "goalType"], triathlonsCompleted: nombre, preferredSessionsByDay: parJour }));
	console.log("Étapes :");
	for (const c of cycles) console.log(`  ${c.startDate} → ${c.endDate}  ${c.title}`);
	console.log("Programme : squelette et prepas retirés ; séances inchangées.");
	if (!APPLY) {
		console.log("\nRelancer avec --apply pour écrire (une sauvegarde est faite avant).");
		return;
	}

	const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const fichier = path.join(__dirname, "users", `sauvegarde-repetition-${UID}-${date}.json`);
	fs.writeFileSync(
		fichier,
		JSON.stringify({ savedAt: new Date().toISOString(), uid: UID, programme: progRef.id, user: avantDe(u, Object.keys(majUser)), program: avantDe(p, Object.keys(majProg)) }, null, 2),
	);
	await userRef.update(majUser);
	await progRef.update(majProg);
	console.log(`\nSauvegarde : ${fichier}\nCompte de test remis en v1. Retour arrière : node repetition-bascule-compte-test.js --restaurer=${fichier} --apply`);
};

const restaurer = async () => {
	const s = JSON.parse(fs.readFileSync(RESTAURER, "utf8"));
	if (s.uid !== UID) throw new Error("Sauvegarde d'un autre compte : refusé.");
	const remise = (avant) => Object.fromEntries(Object.entries(avant).map(([c, v]) => [c, v === ABSENT ? FieldValue.delete() : v]));
	console.log(`${APPLY ? "RESTAURATION" : "SIMULATION de la restauration"} — fiche : ${Object.keys(s.user).join(", ")} ; programme ${s.programme} : ${Object.keys(s.program).join(", ")}`);
	if (!APPLY) return console.log("\nRelancer avec --apply pour restaurer.");
	await db.collection("users").doc(UID).update(remise(s.user));
	await db.collection("users").doc(UID).collection("programs").doc(s.programme).update(remise(s.program));
	console.log("Compte de test restauré.");
};

(RESTAURER ? restaurer() : preparer())
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
