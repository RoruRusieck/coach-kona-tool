/**
 * Lecture seule. L'état d'un compte vu par le profil refait (coach-kona, feature/refonte-profil) :
 * ce que chaque écran affichera, pour préparer un test sur téléphone. 21/10/2026.
 *
 * Usage : node inspect-profil-test.js <uid>
 */
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./keys/firebaseKey.json")) });
const db = admin.firestore();

const uid = process.argv[2];
const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

(async () => {
	if (!uid) throw new Error("Usage : node inspect-profil-test.js <uid>");
	const f = (await db.doc(`users/${uid}`).get()).data();
	if (!f) throw new Error("pas de fiche");
	const g = f.triathlonGoals ?? {};
	const xp = f.triathlonExperience ?? {};
	const eq = f.equipment ?? {};
	console.log("COMPTE", { onboardingVersion: f.onboardingVersion, asCompleteForm: f.asCompleteForm, language: f.language, unitSystem: f.unitSystem, prenom: !!f.firstname, emailPending: f.emailPending ?? null, deletionRequestedAt: f.deletionRequestedAt ?? null });
	console.log("ABONNEMENT (fiche)", f.subscription ? { hasAccess: f.subscription.hasAccess, isInTrial: f.subscription.isInTrial, isBeta: f.subscription.isBeta, hasManualAccess: f.subscription.hasManualAccess, source: f.subscription.source, expiresAt: f.subscription.expiresAt } : null);
	console.log("COURSES", { principale: g.primary ? { format: g.primary.distanceLabel, date: g.primary.raceDate, goalType: g.primary.goalType } : null, autres: (g.secondary ?? []).map((c) => ({ type: c.type, date: c.evenDate, priorite: c.priority })) });
	console.log("DÉMARRAGE", f.trainingStartDate, "| séances/sem", f.targetWeeklyTrainingSessions, "| heures max", f.targetMaxWeeklyTrainingHours, "| repos", f.preferredRestDay, "| natation", f.swimDays);
	console.log("CHIFFRES", f.metrics, "| historique", Object.fromEntries(Object.entries(f.metricsHistory ?? {}).map(([k, v]) => [k, (v ?? []).length])));
	console.log("COMPLÉTION", {
		annees: xp.triathlonYears ?? null,
		chronoCap: xp.runningExperience?.noRecentTime ? "aucun" : xp.runningExperience?.timeSeconds ?? null,
		chronoNat: xp.swimExperience?.noRecentTime ? "aucun" : xp.swimExperience?.timeSeconds ?? null,
		transitions: xp.transitionComfort ?? null,
		avant: f.currentWeeklyTrainingSessions ?? null,
		sommeil: f.averageSleepPerNightHours ?? null,
		montre: eq.watch ?? null,
		capteurs: [eq.hrSensor, eq.bike?.cadenceSensor, eq.run?.treadmill],
		velo: eq.bike?.bikeType ?? null,
		natation: eq.swimGear ?? null,
	});
	console.log("SANTÉ", (f.injuries ?? []).map((i) => ({ zone: i.bodyPart, statut: i.status, gravite: i.severity })), "| absences", (f.unavailabilities ?? []).map((u) => `${u.startDate}→${u.endDate}`));
	console.log("TESTS DEMANDÉS", (f.testRequests ?? []).map((t) => `${t.test} ${t.status}`), "| notifs", f.notificationPreferences ?? "(absentes = tout activé)");
	const progs = await db.collection(`users/${uid}/programs`).get();
	for (const p of progs.docs) {
		const d = p.data();
		const s = await p.ref.collection("sessions").get();
		const seances = s.docs.map((x) => x.data());
		const parStatut = seances.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {});
		const dates = seances.map((x) => x.date).sort();
		console.log("PROGRAMME", p.id, d.status, `${d.startDate}→${d.endDate}`, "generatedUntil", d.generatedUntil, "| séances", seances.length, parStatut, dates[0], "→", dates.at(-1), "| aujourd'hui :", seances.filter((x) => x.date === aujourdhui).length, "| futures planifiées :", seances.filter((x) => x.date > aujourdhui && x.status === "PLANNED").length, "| tests isTest :", seances.filter((x) => x.isTest).length);
	}
	process.exit(0);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
