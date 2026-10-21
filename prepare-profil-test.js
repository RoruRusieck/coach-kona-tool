/**
 * Prépare le compte de test de Romain pour tester le profil refait sur téléphone (21/10/2026) :
 * un programme vivant (semaine 1 faite, une séance hier, une aujourd'hui, la suite planifiée jusqu'au
 * 1er novembre), des chiffres cohérents avec leur historique, et les restes des tests sur émulateur
 * retirés (email en attente, demandes de test, demande de suppression).
 *
 * Aucun trigger ne part : les séances sont supprimées puis recréées (pas mises à jour, ce qui
 * posterait dans Discord via notifyOnSessionStatusChange / onFirstSessionDone), `asCompleteForm` et
 * le programme lui-même ne sont pas touchés (seul `generatedUntil` change).
 *
 * Gardé tel quel, exprès : la complétion partielle (années, sommeil, marque de montre), pour tester
 * « Complète ton profil » ; l'objectif L du 08/04/2027 et le 10 km A du 22/12/2026.
 *
 * Usage : node prepare-profil-test.js [--apply]
 *   Sans --apply : affiche ce qui serait écrit. À lancer après `node backup-user.js <uid>`.
 */
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./keys/firebaseKey.json")) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const UID = "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const PROGRAMME = "romain_20261012_7391";
const appliquer = process.argv.includes("--apply");

const plusJours = (date, n) => {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};

(async () => {
	const ficheRef = db.doc(`users/${UID}`);
	const progRef = db.doc(`users/${UID}/programs/${PROGRAMME}`);
	const [fiche, prog] = await Promise.all([ficheRef.get(), progRef.get()]);
	if (!fiche.exists || !prog.exists) throw new Error("compte ou programme introuvable");
	if (prog.get("status") !== "OPEN") throw new Error("programme pas OPEN");

	// ── La fiche ─────────────────────────────────────────────────────────────
	const majFiche = {
		emailPending: FieldValue.delete(),
		testRequests: FieldValue.delete(),
		deletionRequestedAt: FieldValue.delete(),
		// Les résultats des tests de la semaine 1, et l'historique qui va avec (questionnaire, puis tests).
		"metrics.vmaKmh": 15.5,
		"metrics.ftpWatts": 225,
		"metrics.cssMinPerHundredMeters": 1.55,
		metricsHistory: {
			vmaKmh: [
				{ date: "2026-10-12", value: 14.5, source: "form" },
				{ date: "2026-10-16", value: 15.5, source: "test" },
			],
			ftpWatts: [
				{ date: "2026-10-12", value: 210, source: "form" },
				{ date: "2026-10-18", value: 225, source: "test" },
			],
			cssMinPerHundredMeters: [
				{ date: "2026-10-12", value: 2.05, source: "form" },
				{ date: "2026-10-13", value: 1.55, source: "test" },
			],
		},
		// Une absence passée (« passées », repliées) ; les nouvelles se testent depuis l'app.
		unavailabilities: [{ startDate: "2026-10-01", endDate: "2026-10-04", reason: "Vacances" }],
	};

	// ── Les séances ──────────────────────────────────────────────────────────
	const existantes = await progRef.collection("sessions").get();
	const parId = Object.fromEntries(existantes.docs.map((d) => [d.id, d.data()]));
	const modele = (cle) => {
		const id = Object.keys(parId).find((k) => k.includes(cle));
		if (!id) throw new Error(`séance modèle ${cle} introuvable`);
		return parId[id];
	};
	const fait = (s, rpe) => ({ ...s, status: "DONE", perceivedEffort: rpe, perceivedCondition: "VERY_WELL" });

	const nouvelles = {};
	// Semaine 1 : les mêmes séances (dont les 3 tests), faites.
	const rpes = [8, 5, 4, 9, 5, 8];
	existantes.docs
		.map((d) => d.data())
		.sort((a, b) => a.date.localeCompare(b.date))
		.forEach((s, i) => {
			nouvelles[s.sessionId] = fait(s, rpes[i]);
		});
	// Semaines 2 et 3 : natation, vélo, natation, renfo, vélo, renfo (pas de tests ni de course : des
	// modèles qui ne sont pas des tests, pour ne pas montrer un contenu de test sous un autre titre).
	const plan = ["nat_Sem01_sessiondate20261015", "velo_Sem01_sessiondate20261014", "nat_Sem01_sessiondate20261015", "renfo", "velo_Sem01_sessiondate20261014", "renfo"];
	const abbr = { Natation: "nat", Cyclisme: "velo", Renforcement: "renfo" };
	for (const semaine of [2, 3]) {
		plan.forEach((cle, i) => {
			const m = modele(cle);
			const date = plusJours("2026-10-13", (semaine - 1) * 7 + i);
			const sem = String(semaine).padStart(2, "0");
			const id = `${PROGRAMME}_${abbr[m.type]}_Sem${sem}_sessiondate${date.replaceAll("-", "")}`;
			const s = { ...m, date, sessionId: id, weekid: `${PROGRAMME}_sem${sem}`, status: "PLANNED" };
			delete s.isTest;
			delete s.perceivedEffort;
			delete s.perceivedCondition;
			delete s.comment;
			// Hier (20/10) : faite.
			nouvelles[id] = date === "2026-10-20" ? fait(s, 6) : s;
		});
	}

	console.log(appliquer ? "ÉCRITURE" : "SIMULATION (rien n'est écrit)");
	console.log("Fiche :", Object.keys(majFiche).join(", "));
	console.log(`Séances : ${existantes.size} supprimées puis ${Object.keys(nouvelles).length} créées`);
	for (const [id, s] of Object.entries(nouvelles).sort((a, b) => a[1].date.localeCompare(b[1].date))) {
		console.log(`  ${s.date} ${s.type.padEnd(13)} ${s.status.padEnd(7)} ${s.isTest ? "TEST " : "     "}${s.title ?? ""}`);
	}
	console.log("Programme : generatedUntil 2026-10-18 → 2026-11-01");
	if (!appliquer) {
		console.log("\nRelancer avec --apply (après node backup-user.js " + UID + ").");
		process.exit(0);
	}

	await ficheRef.update(majFiche);
	for (const d of existantes.docs) await d.ref.delete();
	for (const [id, s] of Object.entries(nouvelles)) await progRef.collection("sessions").doc(id).set(s);
	await progRef.update({ generatedUntil: "2026-11-01" });
	console.log("\nFait.");
	process.exit(0);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
