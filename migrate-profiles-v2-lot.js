/**
 * Bascule en lot des fiches v1 en v2, le jour de la release du moteur de Friel (décision de Romain, 08/11/2026 ;
 * zoro : projects/prompts-v2/candidats/2026-11-friel/paquet-prod/README.md). Mêmes déductions que
 * migrate-profile-v2.js (`migration/profil-v2.js`) : on ajoute seulement ce que la v2 lit et que la fiche n'a pas,
 * puis `onboardingVersion: 2` à part, en dernier. Ni programme, ni séances, ni `asCompleteForm` ne sont touchés
 * (seule fonction déclenchée par une fiche : `notifyOnFormCompleted`, sur asCompleteForm false → true).
 *
 * Périmètre : les comptes qui ont rempli l'ancien formulaire (`asCompleteForm`) et ne sont pas en v2. Les autres
 * passeront par le questionnaire v2 de l'app, qui écrit lui-même `onboardingVersion: 2`.
 *
 * Usage :
 *   node migrate-profiles-v2-lot.js                      simulation : ce qui serait écrit, compte par compte, rien n'est écrit
 *   node migrate-profiles-v2-lot.js --apply              écrit, après une sauvegarde de chaque champ touché
 *   node migrate-profiles-v2-lot.js --uid=<uid> [--apply]   un seul compte (répétition générale)
 *   node migrate-profiles-v2-lot.js --restaurer=<fichier> [--apply]   remet les champs tels qu'avant (retour arrière)
 *
 * La sauvegarde (users/sauvegarde-bascule-v2-<date>.json, données perso : ne jamais commiter) garde, pour chaque
 * compte, la valeur d'avant de chaque champ écrit (ou son absence). Le retour arrière ne touche que ces champs :
 * ce que l'abonné a changé ailleurs depuis est préservé.
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");
const { deductionsV2, valeurA } = require("./migration/profil-v2");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const APPLY = process.argv.includes("--apply");
const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const SEUL = arg("uid");
const RESTAURER = arg("restaurer");
const ABSENT = "__absent__";
const date = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const migrer = async () => {
	const docs = SEUL ? [await db.collection("users").doc(SEUL).get()] : (await db.collection("users").get()).docs;
	const cibles = docs.filter((d) => d.exists && d.get("onboardingVersion") !== 2 && (SEUL || d.get("asCompleteForm") === true));
	console.log(`${APPLY ? "ÉCRITURE" : "SIMULATION, rien n'est écrit"} — ${cibles.length} compte(s) à basculer${SEUL ? "" : ` sur ${docs.length} fiches`}`);

	const plan = cibles.map((d) => {
		const u = d.data();
		const { maj, inconnu } = deductionsV2(u);
		const champs = [...Object.keys(maj), "onboardingVersion"];
		const avant = Object.fromEntries(champs.map((c) => [c, valeurA(u, c) === undefined ? ABSENT : valeurA(u, c)]));
		return { uid: d.id, prenom: u.firstname ?? "?", maj, inconnu, avant };
	});

	// Le résumé : combien de comptes reçoivent chaque champ, et ce qu'on n'a pas su déduire.
	const parChamp = {};
	for (const p of plan) for (const c of Object.keys(p.maj)) parChamp[c] = (parChamp[c] ?? 0) + 1;
	console.log("Champs écrits (nombre de comptes) :", JSON.stringify(parChamp));
	const sansDeduction = plan.filter((p) => p.inconnu.length);
	console.log(`Comptes avec une déduction impossible (laissée vide, la v2 la gère) : ${sansDeduction.length}`);
	for (const p of plan) console.log(`  ${p.uid.slice(0, 8)} ${p.prenom.padEnd(14)} ${JSON.stringify(p.maj)}${p.inconnu.length ? `  ⚠ ${p.inconnu.join(" ; ")}` : ""}`);

	if (!APPLY) {
		console.log("\nRelancer avec --apply pour écrire (une sauvegarde est faite avant).");
		return;
	}

	const fichier = path.join(__dirname, "users", `sauvegarde-bascule-v2-${date()}.json`);
	fs.writeFileSync(fichier, JSON.stringify({ savedAt: new Date().toISOString(), comptes: plan.map(({ uid, avant }) => ({ uid, avant })) }, null, 2));
	console.log(`\nSauvegarde : ${fichier}`);

	let faits = 0;
	const echecs = [];
	for (const p of plan) {
		try {
			const ref = db.collection("users").doc(p.uid);
			if (Object.keys(p.maj).length) await ref.update(p.maj);
			await ref.update({ onboardingVersion: 2 });
			faits++;
		} catch (e) {
			echecs.push(`${p.uid} : ${e.message}`);
		}
	}
	console.log(`Basculés : ${faits}/${plan.length}`);
	for (const e of echecs) console.log(`  ÉCHEC ${e}`);
	console.log(`Retour arrière : node migrate-profiles-v2-lot.js --restaurer=${fichier} --apply`);
};

const restaurer = async () => {
	const { comptes } = JSON.parse(fs.readFileSync(RESTAURER, "utf8"));
	console.log(`${APPLY ? "RESTAURATION" : "SIMULATION de la restauration, rien n'est écrit"} — ${comptes.length} compte(s)`);
	let faits = 0;
	for (const { uid, avant } of comptes) {
		const remise = Object.fromEntries(Object.entries(avant).map(([c, v]) => [c, v === ABSENT ? FieldValue.delete() : v]));
		console.log(`  ${uid.slice(0, 8)} ${Object.entries(avant).map(([c, v]) => `${c}=${v === ABSENT ? "(absent)" : JSON.stringify(v)}`).join(" ")}`);
		if (APPLY) {
			await db.collection("users").doc(uid).update(remise);
			faits++;
		}
	}
	if (APPLY) console.log(`Restaurés : ${faits}/${comptes.length}`);
	else console.log("\nRelancer avec --apply pour restaurer.");
};

(RESTAURER ? restaurer() : migrer())
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
