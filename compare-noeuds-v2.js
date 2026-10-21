/**
 * Lecture seule. Avant de réimporter des nœuds v2 dans n8n : exécute l'ancien code (celui en prod,
 * gardé dans une sauvegarde) et le nouveau (`prompts-v2/code/dist`) des nœuds « Cadre » (génération)
 * et « Cadre renouvellement » sur les vraies fiches v2, avec les données qu'enverrait
 * integrationContext, et compare ce que reçoit le LLM. Rien n'est écrit. 21/10/2026.
 *
 * Usage : node compare-noeuds-v2.js [dossier-ancien-dist]
 *   par défaut : zoro/projects/automatisation/prompts/prod/sauvegardes/2026-10-20-avant-profil/dist
 */
const path = require("path");
const fs = require("fs");
const TOOL = __dirname;
const admin = require(path.join(TOOL, "node_modules/firebase-admin"));
admin.initializeApp({ credential: admin.credential.cert(require(path.join(TOOL, "keys/firebaseKey.json"))) });
const db = admin.firestore();

const ZORO = "/Users/roru/Documents/zoro/projects";
const ANCIEN = process.argv[2] ?? path.join(ZORO, "automatisation/prompts/prod/sauvegardes/2026-10-20-avant-profil/dist");
const NOUVEAU = path.join(ZORO, "prompts-v2/code/dist");
const BLOQUES = ["email", "firstName", "lastName", "phone", "role", "subscription", "stripeCustomerId", "createdAt", "updatedAt", "injuriesNote"];

const executer = (dossier, fichier, entree) => {
	const code = fs.readFileSync(path.join(dossier, fichier), "utf8");
	const $input = { first: () => ({ json: entree }) };
	const $ = () => ({ first: () => ({ json: { body: {} } }) });
	try {
		return { ok: true, sortie: new Function("$input", "$", `return (() => { ${code} })();`)($input, $)[0].json };
	} catch (e) {
		return { ok: false, erreur: e.message };
	}
};

const lignesDiff = (a, b) => {
	const A = new Set(a.split("\n"));
	const B = new Set(b.split("\n"));
	return { plus: [...B].filter((l) => !A.has(l)), moins: [...A].filter((l) => !B.has(l)) };
};

(async () => {
	const fiches = await db.collection("users").where("onboardingVersion", "==", 2).get();
	const debut = new Date();
	debut.setDate(debut.getDate() - 15);
	const depuis = debut.toISOString().slice(0, 10);
	let identiques = 0;
	for (const doc of fiches.docs) {
		const user = { uid: doc.id, ...doc.data() };
		for (const b of BLOQUES) delete user[b];
		const progs = await db.collection(`users/${doc.id}/programs`).where("status", "==", "OPEN").limit(1).get();
		let program = null;
		if (!progs.empty) {
			program = progs.docs[0].data();
			const s = await progs.docs[0].ref.collection("sessions").where("date", ">=", depuis).get();
			program.sessions = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
		}
		const entree = { schemaVersion: 2, user, program, messages: {} };
		const resultats = [];
		const noeuds = [["génération", "code-node-cadre-v2.js"]];
		if (program) noeuds.push(["renouvellement", "code-node-cadre-renouvellement-v2.js"]);
		for (const [nom, fichier] of noeuds) {
			const a = executer(ANCIEN, fichier, entree);
			const n = executer(NOUVEAU, fichier, entree);
			if (!a.ok || !n.ok) {
				resultats.push(`  ${nom} : ancien ${a.ok ? "OK" : "ERREUR " + a.erreur} / nouveau ${n.ok ? "OK" : "ERREUR " + n.erreur}`);
				continue;
			}
			const ta = JSON.stringify(a.sortie.texte);
			const tn = JSON.stringify(n.sortie.texte);
			if (ta === tn) {
				resultats.push(`  ${nom} : texte envoyé au LLM identique`);
				continue;
			}
			const d = lignesDiff(Object.values(a.sortie.texte).join("\n"), Object.values(n.sortie.texte).join("\n"));
			resultats.push(`  ${nom} : DIFFÉRENT`);
			for (const l of d.moins) resultats.push(`    - ${l}`);
			for (const l of d.plus) resultats.push(`    + ${l}`);
		}
		if (resultats.every((r) => r.includes("identique"))) identiques++;
		console.log(`${doc.id.slice(0, 6)}… (${user.firstname ? "prénom" : "sans prénom"}, programme ${program ? "ouvert" : "aucun"}, demandes de test ${(user.testRequests ?? []).length})`);
		console.log(resultats.join("\n"));
	}
	console.log(`\n${fiches.size} comptes v2, ${identiques} sans aucun changement.`);
	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
