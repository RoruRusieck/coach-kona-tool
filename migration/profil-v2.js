/**
 * Ce que la bascule d'une fiche v1 en v2 écrit (zoro : projects/prompts-v2/bascule-comptes-existants.md), sans
 * Firestore : partagé par migrate-profile-v2.js (un compte) et migrate-profiles-v2-lot.js (tous les comptes).
 * Seulement ce que la v2 lit et que la fiche n'a pas, déduit de la fiche ; rien n'est supprimé ; ni le programme
 * ni `asCompleteForm` (qui déclencherait la génération) ne sont touchés. `onboardingVersion: 2` s'écrit à part, en dernier.
 */
const tranche = (n) => (n <= 0 ? "0" : n <= 3 ? "1-3" : n <= 10 ? "4-10" : "10+");

const JOURS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const nageDans = (v) => JSON.stringify(v ?? "").toUpperCase().includes("SWIM");
const joursNatation = (parJour) => {
	if (!parJour || typeof parJour !== "object") return "any";
	const jours = JOURS.filter((j) => nageDans(parJour[j]));
	return jours.length ? jours : "any";
};

/**
 * @param u le doc users d'un compte v1
 * @param options `start` : trainingStartDate imposée (un lundi)
 * @returns { maj, inconnu } : les champs à écrire (chemins Firestore pointés), et ce qu'on n'a pas pu déduire
 */
const deductionsV2 = (u, { start = null } = {}) => {
	const maj = {};
	const inconnu = [];

	if (u.language !== "fr" && u.language !== "en") maj.language = "fr";

	const xp = u.triathlonExperience ?? {};
	if (!xp.triathlonsCompletedRange) {
		const n = Number(xp.triathlonsCompleted);
		if (xp.triathlonsCompleted !== undefined && xp.triathlonsCompleted !== null && Number.isFinite(n)) maj["triathlonExperience.triathlonsCompletedRange"] = tranche(n);
		else inconnu.push("triathlonsCompleted absent : triathlonsCompletedRange non déduit");
	}

	if (u.swimDays === undefined) maj.swimDays = joursNatation(u.preferredSessionsByDay);

	const p = u.triathlonGoals?.primary;
	if (p && !p.goalType) {
		const t = p.timeGoals;
		const aUnTemps = t && typeof t === "object" ? Object.values(t).some((v) => v !== null && v !== "" && v !== 0) : !!t;
		if (aUnTemps) maj["triathlonGoals.primary.goalType"] = "time";
		else inconnu.push("pas de temps visé : goalType laissé absent (la v2 gère l'absence)");
	}

	if (start) maj.trainingStartDate = start;
	return { maj, inconnu };
};

/** La valeur d'un chemin pointé (« a.b.c ») dans un objet ; `undefined` si absent. */
const valeurA = (objet, chemin) => chemin.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), objet);

module.exports = { deductionsV2, valeurA, tranche, joursNatation };
