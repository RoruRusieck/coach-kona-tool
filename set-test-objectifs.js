/**
 * Place le compte de test dans une situation de l'onglet Objectifs refait (fiches Objectifs 1.2,
 * 28/10/2026), pour l'essayer sur appareil sans attendre une vraie course.
 *
 * N'écrit que `triathlonGoals` (aucun autre champ, jamais `asCompleteForm`) ; aucune fonction ne
 * se déclenche sur ce champ. Les dates partent d'aujourd'hui.
 *
 * Simulation par défaut : affiche ce qui serait écrit. Avec --apply : sauvegarde d'abord les
 * objectifs actuels dans keys/ (ignoré par git), puis écrit.
 *
 * Usage :
 *   node set-test-objectifs.js <situation> [--apply] [--uid=<uid>] [--replanifier]
 *   node set-test-objectifs.js --restaurer=keys/backup-objectifs-<uid>-<date>.json [--apply]
 *
 * Situations :
 *   avant        course principale dans 30 jours (carte « Et après ta course ? »), un 10 km et un triathlon S
 *   jourj        course principale aujourd'hui
 *   lendemain    course principale hier, pas encore de réponse (« Comment s'est passée ta course ? »)
 *   suite        course principale hier, finie en 2 h 27, rien après (« Et maintenant ? »)
 *   releve       course principale hier, finie ; un triathlon B et un triathlon A après (relève)
 *   majeure-apres course principale hier, racontée plus tard ; un marathon A après (variante majeure)
 *   majeure      pas de course principale ; un marathon A à venir (« Je te prépare pour »)
 *   base         pas de course principale, pas de course majeure (préparation de base)
 *   sansdate     course principale sans date, un marathon A à venir (« En attendant ta date »)
 *   finir        course principale dans 60 jours, objectif « Le finir » (invitation aux temps visés)
 *   global       course principale dans 60 jours, temps global seul (« Répartir mon temps visé »)
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
const UID = arg("uid") ?? "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const APPLY = process.argv.includes("--apply");
const RESTAURER = arg("restaurer");
const SITUATION = process.argv.slice(2).find((a) => !a.startsWith("--"));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dansJours = (n) => {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return iso(d);
};
const maintenant = new Date().toISOString();
// Les courses sont datées d'avant le dernier programme : sinon l'app conclut, à juste titre, que la
// course a changé depuis et montre « Je replanifie ta prépa » à la place des étapes. `--replanifier`
// les date d'aujourd'hui pour voir cette carte.
const DATE_COURSES = process.argv.includes("--replanifier") ? maintenant : "2026-10-01T00:00:00.000Z";

const principale = (raceDate, extra = {}) => ({
	distanceLabel: "M",
	distancesValues: { swim: "1.5", bike: "40", run: "10" },
	distancesMeters: { swim: 1500, bike: 40000, run: 10000 },
	raceDate,
	raceName: "Triathlon de test",
	raceTerrain: "UNDULATING",
	goalType: "time",
	timeGoals: { globalSeconds: 9000, swimSeconds: 1680, bikeSeconds: 4320, runSeconds: 2820 },
	elevationGain: { bikeMeters: 450, runMeters: 80 },
	createdAt: DATE_COURSES,
	updatedAt: DATE_COURSES,
	...extra,
});

const autre = (id, evenDate, priority, type, extra = {}) => ({
	id,
	type,
	eventName: null,
	evenDate,
	distanceLabel: type === "triathlon" ? "S" : null,
	distancesValues: { swim: null, bike: null, run: null },
	...(type === "triathlon" ? { distancesMeters: { swim: 750, bike: 20000, run: 5000 } } : {}),
	raceTerrain: null,
	priority,
	timeGoals: { globalSeconds: null },
	elevationGainMeters: null,
	createdAt: DATE_COURSES,
	...extra,
});

const archivee = { ...principale(dansJours(-200)), raceName: "Triathlon passé (test)", archivedAt: maintenant, result: { status: "finished", timeSeconds: 9300, at: maintenant } };

const SITUATIONS = {
	avant: () => ({
		primary: principale(dansJours(30)),
		// Un triathlon à venir, pour tester « En faire ma course principale » en pleine prépa (fiche 03).
		secondary: [autre(0, dansJours(10), "C", "run_10k"), autre(1, dansJours(20), "B", "triathlon", { eventName: "Triathlon S de test" })],
	}),
	jourj: () => ({ primary: principale(dansJours(0)), secondary: [] }),
	lendemain: () => ({ primary: principale(dansJours(-1)), secondary: [] }),
	suite: () => ({ primary: principale(dansJours(-1), { result: { status: "finished", timeSeconds: 8820, at: maintenant } }), secondary: [] }),
	releve: () => ({
		primary: principale(dansJours(-1), { result: { status: "finished", timeSeconds: 8820, at: maintenant } }),
		secondary: [autre(0, dansJours(60), "B", "triathlon", { eventName: "Triathlon S de test" }), autre(1, dansJours(100), "A", "triathlon", { eventName: "Triathlon L de test", distanceLabel: "L" })],
	}),
	"majeure-apres": () => ({
		primary: principale(dansJours(-1), { afterRace: { resultLaterAt: maintenant } }),
		secondary: [autre(0, dansJours(90), "A", "marathon")],
	}),
	majeure: () => ({ primary: null, secondary: [autre(0, dansJours(90), "A", "marathon")], archives: { primary: [archivee], secondary: [] } }),
	base: () => ({ primary: null, secondary: [autre(0, dansJours(40), "B", "run_10k")], archives: { primary: [archivee], secondary: [] } }),
	sansdate: () => ({ primary: principale(null, { raceName: null }), secondary: [autre(0, dansJours(90), "A", "marathon")] }),
	finir: () => ({ primary: principale(dansJours(60), { goalType: "finish", timeGoals: { globalSeconds: null, swimSeconds: null, bikeSeconds: null, runSeconds: null } }), secondary: [] }),
	global: () => ({ primary: principale(dansJours(60), { timeGoals: { globalSeconds: 9000, swimSeconds: null, bikeSeconds: null, runSeconds: null } }), secondary: [] }),
};

(async () => {
	const ref = db.collection("users").doc(UID);
	const snap = await ref.get();
	if (!snap.exists) throw new Error(`Aucun doc users/${UID}`);
	const avant = snap.data().triathlonGoals ?? null;

	let apres;
	if (RESTAURER) {
		apres = JSON.parse(fs.readFileSync(RESTAURER, "utf8")).triathlonGoals;
		console.log(`Restauration depuis ${RESTAURER}`);
	} else {
		if (!SITUATION || !SITUATIONS[SITUATION]) {
			console.error(`Situation inconnue. Au choix : ${Object.keys(SITUATIONS).join(", ")}`);
			process.exit(1);
		}
		// Les archives existantes sont gardées, sauf si la situation en pose.
		const s = SITUATIONS[SITUATION]();
		apres = { archives: avant?.archives ?? { primary: [], secondary: [] }, ...s };
	}

	console.log(`users/${UID} — triathlonGoals ${APPLY ? "écrit" : "qui serait écrit"} :`);
	console.log(JSON.stringify(apres, null, 2));

	if (!APPLY) {
		console.log("\nSimulation : rien n'est écrit. Ajouter --apply.");
		return;
	}
	const sauvegarde = path.join(__dirname, "keys", `backup-objectifs-${UID}-${maintenant.replace(/[:.]/g, "-")}.json`);
	fs.writeFileSync(sauvegarde, JSON.stringify({ uid: UID, triathlonGoals: avant }, null, 2));
	await ref.update({ triathlonGoals: apres });
	console.log(`\nÉcrit. Sauvegarde d'avant : ${path.relative(__dirname, sauvegarde)}`);
	console.log(`Pour revenir : node set-test-objectifs.js --restaurer=${path.relative(__dirname, sauvegarde)} --apply`);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
