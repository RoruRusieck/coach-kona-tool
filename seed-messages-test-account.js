// Remplace la conversation du compte de test par un exemple complet de la refonte de Messages (fiche
// Hwei v1.2) : message d'accueil, livraison avec sa carte de cycle, groupe de deux bulles, message
// modifié par Ben, annonce, message écrit depuis une séance (« À propos de »), renouvellement non lu
// (ouverture dessus), dernier message du triathlète « Lu » suivi d'une annonce (le statut reste).
//
// Sans --apply : affiche ce qui serait supprimé et écrit, ne touche à rien.
// Avec --apply : sauvegarde la conversation actuelle dans exports/, la supprime, écrit l'exemple.
//
// Déclencheurs à la création (coach-kona-infra/functions/index.js) :
// - chaque message du triathlète part sur le Discord de Ben (notifyOnAdminMessage), qui lance la
//   suggestion de réponse n8n ;
// - chaque message du coach envoie une notification push au compte de test (notifyOnNewMessage).
// Rien à la suppression.
//
// Usage : node seed-messages-test-account.js [--apply]

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const UID = "vDF1OPD8QUbCUkGKRkFcfmz8kRw2";
const COACH = "igRDQXYLU4SryOuLX7uoHqBtKQ22";
const APPLY = process.argv.includes("--apply");

const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

const accueil = [
	"Bonjour Romain,",
	"Tu viens de faire le premier pas. Merci pour ta confiance 👊",
	"J'ai bien reçu tes réponses. Je connais ton objectif, ton niveau et tes contraintes. À partir de là, je construis le plan d'entraînement qui te correspond.",
	"Voici la suite ⏱️\n📩 Sous 48h, tu reçois ton plan personnalisé : natation, vélo, course, récupération, nutrition.\n🎯 La première semaine sert à calibrer tes allures.\n🔄 Tous les 15 jours, j'ajuste ton plan selon ta progression et ta fatigue.",
	"Cette messagerie, c'est ton canal direct avec moi 💬 Une question, un doute, un coup de mou ? Écris-moi. Je te réponds sous 48h max, toujours.",
	"Si tu veux voir les retours d'autres triathlètes que j'accompagne, ça se passe sur Instagram : @coach.kona.",
	"Deviens le triathlète que tu veux être.",
	"Coach Kona, avec toi, pour l'exploit.",
].join("\n\n");

/** L'exemple, dans l'ordre du fil. `id` fixe : relancer le script réécrit les mêmes documents. */
const EXEMPLE = [
	{ id: "welcome", de: "coach", at: "2026-10-12T19:02:00+02:00", seen: true, kind: "other", text: accueil },
	{
		id: "exemple-01-livraison",
		de: "coach",
		at: "2026-10-13T08:15:00+02:00",
		seen: true,
		kind: "program_first",
		cycle: { startDate: "2026-10-13", endDate: "2026-10-25" },
		text: [
			"Bonjour Romain,",
			"Ton premier cycle est prêt. Ces deux semaines servent à poser les bases : de la technique en natation, du vélo en zone 1 et 2, et du renforcement pour encaisser la suite.",
			"Ne cherche pas la performance. Ce que je veux voir, c'est de la régularité et ton ressenti après chaque séance.\nValide chaque séance avec ton effort et un mot : c'est ce que je lis pour construire le cycle suivant.",
			"Bonne semaine !",
		].join("\n\n"),
	},
	{ id: "exemple-02-merci", de: "moi", at: "2026-10-14T07:40:00+02:00", seen: true, text: "Merci coach, hâte de commencer !" },
	{
		id: "exemple-03-question",
		de: "moi",
		at: "2026-10-14T07:42:00+02:00",
		seen: true,
		text: "Petite question : je peux faire la natation le soir plutôt que le matin ?",
	},
	{
		id: "exemple-04-reponse-modifiee",
		de: "coach",
		at: "2026-10-14T12:30:00+02:00",
		edited: "2026-10-14T12:41:00+02:00",
		seen: true,
		kind: "other",
		text: "Oui, sans problème. Garde juste deux heures entre ton repas et la séance, et évite de la caler la veille d'une sortie vélo longue.",
	},
	{
		id: "exemple-05-annonce",
		de: "coach",
		at: "2026-10-16T18:30:00+02:00",
		seen: true,
		kind: "announcement",
		text: "Bonjour les triathlètes,\n\nJe suis en train de travailler sur les nouveaux écrans de l'application. Si quelque chose vous gêne au quotidien, écrivez-le-moi ici : je lis tout.",
	},
	{
		id: "exemple-06-a-propos",
		de: "moi",
		at: "2026-10-20T21:05:00+02:00",
		seen: true,
		text: "À propos de : Découverte technique crawl, mardi 20 octobre\nJ'ai coupé à 800 m au lieu de 1 000, l'épaule droite tirait un peu. Je valide quand même la séance ?",
	},
	{
		id: "exemple-07-reponse-longue",
		de: "coach",
		at: "2026-10-20T21:40:00+02:00",
		seen: true,
		kind: "other",
		text: [
			"Bonjour Romain. Valide-la, et écris dans le commentaire ce que tu as vraiment nagé : 800 m, avec ton ressenti.",
			"Le volume est proche de ce qui était prévu. C'est exactement le genre de retour dont j'ai besoin pour construire ton prochain cycle.",
			"Pour l'épaule : si la gêne revient à la prochaine séance, dis-le-moi, j'allège la natation. Si elle s'installe ou s'aggrave, consulte un professionnel de santé.",
		].join("\n\n"),
	},
	{
		id: "exemple-08-renouvellement",
		de: "coach",
		at: "2026-10-22T19:00:00+02:00",
		seen: false,
		kind: "program_renewal",
		cycle: { startDate: "2026-10-26", endDate: "2026-11-01" },
		text: [
			"Bonjour Romain,",
			"Ton nouveau cycle est en ligne. Tu as tenu la régularité sur les deux premières semaines : on garde la même structure et on ajoute un peu de volume à vélo.",
			"Côté natation, je garde des séances courtes et techniques, le temps de voir comment réagit ton épaule. Tu as un éducatif de plus en début de séance : prends ton temps dessus.",
			"Le renforcement passe à deux séances par semaine. Elles sont courtes, mais ce sont elles qui te protègent quand le volume monte.",
			"Si une séance ne rentre pas dans ta semaine, déplace-la plutôt que de la sauter : le jour importe moins que la régularité.",
			"Bonne semaine, et tiens-moi au courant pour l'épaule.",
		].join("\n\n"),
	},
	{
		id: "exemple-09-dernier",
		de: "moi",
		at: "2026-10-23T07:12:00+02:00",
		seen: true,
		text: "Merci ! Pour le renforcement de ce soir, je n'ai pas d'élastique. Je peux remplacer par des exercices au poids du corps ?",
	},
	{
		id: "exemple-10-annonce-apres",
		de: "coach",
		at: "2026-10-23T18:30:00+02:00",
		seen: false,
		kind: "announcement",
		text: "Petit rappel pour tout le monde : les séances validées avec un commentaire m'aident à mieux ajuster vos cycles. Une phrase suffit.",
	},
];

const docDe = (m) => ({
	senderId: m.de === "moi" ? UID : COACH,
	text: m.text,
	createdAt: ts(m.at),
	seen: m.seen,
	...(m.kind ? { kind: m.kind } : {}),
	...(m.cycle ? { cycle: m.cycle } : {}),
	...(m.edited ? { editedAt: ts(m.edited) } : {}),
});

async function main() {
	const user = (await db.collection("users").doc(UID).get()).data();
	if (!user || user.email !== "rusiecki.romain@gmail.com") throw new Error("ce n'est pas le compte de test attendu");

	const ref = db.collection("chats").doc(UID).collection("messages");
	const actuels = await ref.get();
	console.log(`Compte ${UID} (${user.email}) : ${actuels.size} messages à supprimer.`);
	console.log(`Exemple à écrire : ${EXEMPLE.length} messages, dont ${EXEMPLE.filter((m) => m.de === "moi").length} du triathlète (Discord + n8n chacun) et ${EXEMPLE.filter((m) => m.de === "coach").length} du coach (une push chacun).`);
	for (const m of EXEMPLE) console.log(`  ${m.at.slice(0, 16)} ${m.de.padEnd(5)} ${(m.kind ?? "").padEnd(16)} ${m.seen ? "lu" : "non lu"}${m.edited ? " · modifié" : ""}${m.cycle ? ` · ${m.cycle.startDate} → ${m.cycle.endDate}` : ""} | ${m.text.slice(0, 60).replace(/\n/g, " ")}`);

	if (!APPLY) {
		console.log("\nÀ blanc : rien n'a été modifié. Relancer avec --apply.");
		return;
	}

	const sauvegarde = path.join(__dirname, "exports", `backup-messages-compte-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
	fs.writeFileSync(
		sauvegarde,
		JSON.stringify(
			actuels.docs.map((d) => ({ id: d.id, ...d.data() })),
			null,
			2,
		),
	);
	console.log(`\nSauvegarde : ${sauvegarde}`);

	for (let i = 0; i < actuels.docs.length; i += 400) {
		const batch = db.batch();
		actuels.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
		await batch.commit();
	}
	console.log(`${actuels.size} messages supprimés.`);

	const batch = db.batch();
	for (const m of EXEMPLE) batch.set(ref.doc(m.id), docDe(m));
	await batch.commit();
	console.log(`${EXEMPLE.length} messages écrits.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
