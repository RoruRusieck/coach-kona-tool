/**
 * Lecture seule. Pour la notification « Rappels » (profil refait, fiche 08 §3.1 bis) : comment ranger
 * deux séances d'une même journée ? Cherche, dans les programmes ouverts, les journées à plusieurs
 * séances, et affiche les champs de ces séances (ce qui pourrait donner leur ordre), leurs titres et
 * leur durée. Donne aussi la longueur des titres, et quelques titres de comptes en anglais. 20/10/2026.
 *
 * Aucune donnée personnelle affichée : ni nom, ni email, seulement un début d'identifiant.
 *
 * Usage : node investigate-ordre-seances-jour.js [nombreDeProgrammes=40]
 */
const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MAX = Number(process.argv[2]) || 40;

async function main() {
	const programmes = await db.collectionGroup("programs").where("status", "==", "OPEN").limit(MAX).get();
	const champs = new Map();
	const longueurs = [];
	const titresEn = [];
	let journeesMulti = 0;

	for (const p of programmes.docs) {
		const uid = p.ref.parent.parent.id;
		const fiche = await db.doc(`users/${uid}`).get();
		const langue = fiche.get("language") ?? "?";
		const seances = await p.ref.collection("sessions").get();
		const parJour = new Map();
		for (const s of seances.docs) {
			const d = s.data();
			for (const k of Object.keys(d)) champs.set(k, (champs.get(k) ?? 0) + 1);
			if (typeof d.title === "string") longueurs.push(d.title.length);
			if (langue === "en" && titresEn.length < 8 && d.title) titresEn.push(d.title);
			if (!parJour.has(d.date)) parJour.set(d.date, []);
			parJour.get(d.date).push({ id: s.id, ...d });
		}
		for (const [jour, liste] of parJour) {
			if (liste.length < 2 || journeesMulti >= 8) continue;
			journeesMulti++;
			console.log(`\n${uid.slice(0, 6)}… ${jour} (${langue}) : ${liste.length} séances, dans l'ordre de Firestore`);
			for (const s of liste) {
				const indices = Object.fromEntries(
					Object.entries(s).filter(([k, v]) => /order|index|position|slot|time|heure|rank|num|createdAt|discipline|sport|type/i.test(k) && typeof v !== "object"),
				);
				console.log(`  ${s.id.slice(0, 8)}… « ${s.title} » · ${s.duration} min · ${JSON.stringify(indices)}`);
			}
		}
	}

	console.log(`\nChamps des séances (sur ${programmes.size} programmes ouverts) :`);
	console.log([...champs.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join("  "));
	longueurs.sort((a, b) => a - b);
	const q = (x) => longueurs[Math.floor(x * (longueurs.length - 1))];
	console.log(`\nLongueur des titres : médiane ${q(0.5)}, 90 % ≤ ${q(0.9)}, max ${longueurs[longueurs.length - 1]} caractères`);
	console.log(`Titres de comptes en anglais : ${titresEn.map((t) => `« ${t} »`).join(", ") || "aucun trouvé"}`);
}

main().then(
	() => process.exit(0),
	(e) => {
		console.error(e);
		process.exit(1);
	},
);
