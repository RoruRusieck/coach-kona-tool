/**
 * Remplace les étapes du programme du compte de test par une prépa nommée selon Friel (fiches
 * Objectifs 1.12, 01/11/2026), pour voir le graphe des étapes (charge) et les noms de Friel sur
 * appareil avant que le moteur ne les écrive.
 *
 * Prépa vers le triathlon L du 08/04/2027, avec deux courses A au milieu : le 10 km du 22/12/2026
 * et un semi-marathon le 14/02/2027 (ajouté au compte s'il n'y est pas). Découpage selon la fiche 00,
 * 6, v1.13 (« Quand le temps manque ») : Reprise réduite, blocs retirés en partant du début, au moins
 * une Spécifique avant chaque course A, Compétition qui finit le jour de la course.
 * Titres en français, `periode` écrite comme le fera le moteur ; `prepas` posée pour que l'app
 * reconnaisse la prépa de la course principale.
 *
 * Écrit `cycles` et `prepas` du programme (aucune séance) ; sur la fiche, le semi dans
 * `triathlonGoals.secondary` et `triathlonGoals.primary.updatedAt` reculé avant la génération du
 * programme (sinon l'app montre « Je replanifie ta prépa »). Aucune fonction ne se déclenche sur ces
 * champs.
 *
 * Usage :
 *   node set-test-friel.js [--apply] [--uid=<uid>] [--programme=<id>]
 *   node set-test-friel.js --restaurer=keys/backup-friel-<uid>-<date>.json [--apply]
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
const UID = arg("uid") ?? "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const PROGRAMME = arg("programme") ?? "romain_20261012_7391";
const APPLY = process.argv.includes("--apply");
const RESTAURER = arg("restaurer");

// Les objectifs des étapes : tableau 7.4 de Friel (fiche 00, 6), deux phrases au plus.
const etape = (titre, periode, startDate, endDate, content) => ({ title: titre, periode, startDate, endDate, content });
const CYCLES = [
	etape("Reprise", "prep", "2026-10-12", "2026-10-25", "Je te prépare à l'entraînement : sports croisés, musculation et condition générale. On pose aussi tes tests de référence."),
	etape("Spécifique 1", "build1", "2026-10-26", "2026-11-15", "Endurance musculaire et capacité aérobie, déjà tournées vers ton 10 km. J'entretiens ta force et ta vitesse."),
	etape("Spécifique 2", "build2", "2026-11-16", "2026-12-06", "Le même objectif, au plus près de ton 10 km. C'est l'étape la plus chargée avant lui."),
	etape("Pré-compétition · 10 km", "peak", "2026-12-07", "2026-12-15", "Je simule une partie de ton 10 km toutes les 72 à 96 heures. Entre deux, des séances de récupération."),
	etape("Compétition · 10 km", "race", "2026-12-16", "2026-12-22", "Des intervalles courts à ton allure de course, moins nombreux chaque jour. Et du repos."),
	etape("Transition", "transition", "2026-12-23", "2027-01-03", "Repos et récupération active après ton 10 km."),
	etape("Spécifique 1", "build1", "2027-01-04", "2027-01-31", "Endurance musculaire et capacité aérobie pour ton semi-marathon. J'entretiens ta force et ta vitesse."),
	etape("Pré-compétition · Semi-marathon", "peak", "2027-02-01", "2027-02-07", "Je simule une partie de ton semi toutes les 72 à 96 heures. Entre deux, de la récupération."),
	etape("Compétition · Semi-marathon", "race", "2027-02-08", "2027-02-14", "Des intervalles courts à ton allure de semi, moins nombreux chaque jour. Et du repos."),
	etape("Transition", "transition", "2027-02-15", "2027-02-21", "Repos et récupération active après ton semi."),
	etape("Spécifique 2", "build2", "2027-02-22", "2027-03-21", "Endurance musculaire et capacité aérobie, au plus près de ton triathlon L. C'est l'étape la plus chargée."),
	etape("Pré-compétition · Triathlon L", "peak", "2027-03-22", "2027-04-01", "Je simule une partie de ta course toutes les 72 à 96 heures. Entre deux, de la récupération."),
	etape("Compétition · Triathlon L", "race", "2027-04-02", "2027-04-08", "Des intervalles courts à l'allure de course, moins nombreux chaque jour. Et du repos avant le jour J."),
];
const SEMI = {
	id: 2,
	type: "half_marathon",
	eventName: null,
	evenDate: "2027-02-14",
	distanceLabel: null,
	distancesValues: { swim: null, bike: null, run: "21,1km" },
	distancesMeters: { swim: null, bike: null, run: 21097, run2: null },
	raceTerrain: null,
	priority: "A",
	timeGoals: { globalSeconds: null },
	elevationGainMeters: null,
	createdAt: "2026-10-01T00:00:00.000Z",
};
const AVANT_GENERATION = "2026-10-01T00:00:00.000Z";
const PREPAS = [{ debut: "2026-10-12", cible: { origine: "primary", date: "2027-04-08" } }];

(async () => {
	const ref = db.doc(`users/${UID}/programs/${PROGRAMME}`);
	const snap = await ref.get();
	if (!snap.exists) throw new Error(`Aucun programme users/${UID}/programs/${PROGRAMME}`);
	const avant = snap.data();
	const refUser = db.doc(`users/${UID}`);
	const goals = (await refUser.get()).data()?.triathlonGoals ?? {};

	let apres;
	let apresGoals = null;
	if (RESTAURER) {
		const b = JSON.parse(fs.readFileSync(RESTAURER, "utf8"));
		apres = { cycles: b.cycles, prepas: b.prepas ?? admin.firestore.FieldValue.delete() };
		if (b.goals) apresGoals = { "triathlonGoals.secondary": b.goals.secondary ?? [], "triathlonGoals.primary.updatedAt": b.goals.primaryUpdatedAt ?? admin.firestore.FieldValue.delete() };
		console.log(`Restauration depuis ${RESTAURER}`);
	} else {
		apres = { cycles: CYCLES, prepas: PREPAS };
		const secondaires = Array.isArray(goals.secondary) ? goals.secondary : [];
		apresGoals = {
			"triathlonGoals.secondary": secondaires.some((c) => c.evenDate === SEMI.evenDate) ? secondaires : [...secondaires, SEMI],
			"triathlonGoals.primary.updatedAt": AVANT_GENERATION,
		};
	}

	console.log(`users/${UID}/programs/${PROGRAMME} — étapes ${APPLY ? "écrites" : "qui seraient écrites"} :`);
	for (const c of RESTAURER ? apres.cycles : CYCLES) console.log(`  ${c.startDate} → ${c.endDate}  ${c.periode ?? "-"}  ${c.title}`);

	if (!APPLY) {
		console.log("\nSimulation : rien n'est écrit. Ajouter --apply.");
		return;
	}
	const sauvegarde = path.join(__dirname, "keys", `backup-friel-${UID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
	fs.writeFileSync(sauvegarde, JSON.stringify(
			{
				uid: UID,
				programme: PROGRAMME,
				cycles: avant.cycles ?? [],
				prepas: avant.prepas ?? null,
				goals: { secondary: goals.secondary ?? [], primaryUpdatedAt: goals.primary?.updatedAt ?? null },
			},
			null,
			2,
		));
	await ref.update(apres);
	if (apresGoals && goals.primary) await refUser.update(apresGoals);
	console.log(`\nÉcrit. Sauvegarde d'avant : ${path.relative(__dirname, sauvegarde)}`);
	console.log(`Pour revenir : node set-test-friel.js --restaurer=${path.relative(__dirname, sauvegarde)} --apply`);
})()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
