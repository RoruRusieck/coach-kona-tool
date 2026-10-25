// Lecture seule. Critères de réussite de la refonte de Messages (fiche Hwei du 23/10/2026, §1), à lancer
// avant la sortie puis un mois après, avec les mêmes définitions :
//   1. part des écarts de plus de 6 h entre deux messages d'une même série du triathlète ;
//   2. délai de réponse de Coach Kona (médiane, part sous 48 h) ;
//   3. actifs qui ont écrit sur les 30 derniers jours ;
//   4. messages de Coach Kona jamais lus, hors annonces, chez les actifs ;
//   5. messages du triathlète du type « tu as lu mais tu ne réponds pas » (critère de retrait du « Lu »).
//
// Définitions, alignées sur la fiche (§2.3 : « une annonce n'est pas une réponse ») :
// - série = messages du triathlète qui se suivent sans message de Coach Kona entre eux, annonces et
//   message d'accueil mis à part ;
// - annonce = champ `kind` "announcement" (messages envoyés après la sortie) ou, pour les anciens, même
//   texte envoyé à 3 conversations ou plus en moins de 2 h ;
// - délai de réponse = du premier message de la série qui n'est pas un simple « ok / merci » jusqu'au
//   message suivant de Coach Kona qui n'est pas une annonce ;
// - actif = beta, accès offert, ou fin d'essai / d'abonnement dans le futur (l'indicateur hasAccess de
//   la fiche ne repasse pas toujours à faux à l'expiration). Mesuré au moment du lancement.
// Fenêtre : séries commencées entre (fin - jours) et (fin - 3 jours) ; messages lus/non lus : envoyés
// entre (fin - jours) et (fin - 7 jours). Comptes de test exclus (même règle que
// analyze-onboarding-form-dropoff.js).
//
// Usage : node mesure-messages-refonte.js [--jours 30] [--fin 2026-10-23]

const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const COACH = "igRDQXYLU4SryOuLX7uoHqBtKQ22";
const COACH_ANCIEN = `"${COACH}"`; // déc. 2025 → mars 2026 : identifiant écrit avec ses guillemets
const H = 3600e3;
const J = 24 * H;

const arg = (nom, defaut) => {
	const i = process.argv.indexOf(`--${nom}`);
	return i > -1 ? process.argv[i + 1] : defaut;
};
const JOURS = Number(arg("jours", 30));
const FIN = arg("fin") ? Date.parse(`${arg("fin")}T23:59:59+02:00`) : Date.now();
const DEBUT = FIN - JOURS * J;

const isTest = (u) => {
	const email = (u.email || "").toLowerCase();
	return u.role === "ADMIN" || email.includes("test") || email.includes("+") || email === "rusiecki.romain@gmail.com";
};
const ms = (x) => (!x ? null : typeof x.toMillis === "function" ? x.toMillis() : Date.parse(x) || null);
const estActif = (s = {}) =>
	!!(s.isBeta || s.hasManualAccess || ms(s.expiresAt) > FIN || ms(s.trial?.expiresAt) > FIN);
const ACK =
	/^(ok|oki|okay|merci|top|super|parfait|génial|genial|ça marche|ca marche|d'accord|dac|cool|nickel|yes|thanks|thank you|👍|🙏|💪|bien reçu|reçu|c'est noté|noted)[\s!.,😊🙏👍💪🔥]*/i;
const estAck = (t) => t.trim().length <= 40 && ACK.test(t.trim());
const estAccueil = (m) =>
	m.id === "welcome" || /bienvenue dans ta messagerie coach kona|tu viens de faire le premier pas\. merci pour ta confiance/i.test(m.text);
const weekEnd = (t) => ["Sat", "Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(t));
const quantile = (arr, q) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	const i = (s.length - 1) * q;
	return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : "n/a");
const heures = (x) => (x == null ? "n/a" : `${(x / H).toFixed(1)} h`);

async function main() {
	const usersSnap = await db.collection("users").get();
	const users = {};
	usersSnap.forEach((d) => {
		const u = d.data();
		if (!isTest(u)) users[d.id] = { actif: estActif(u.subscription) };
	});

	const conv = {};
	const coach = [];
	for (const c of (await db.collection("chats").get()).docs) {
		if (!users[c.id]) continue;
		const msgs = (await c.ref.collection("messages").get()).docs
			.map((m) => {
				const x = m.data();
				const senderId = x.senderId ?? "";
				const qui = senderId === COACH || senderId === COACH_ANCIEN ? "coach" : senderId === c.id ? "triathlete" : null;
				return { id: m.id, uid: c.id, qui, text: x.text ?? "", createdAt: ms(x.createdAt), seen: !!x.seen, kind: x.kind ?? null };
			})
			.filter((m) => m.qui && m.createdAt)
			.sort((a, b) => a.createdAt - b.createdAt);
		conv[c.id] = msgs;
		coach.push(...msgs.filter((m) => m.qui === "coach"));
	}

	// Annonces des messages d'avant la sortie : même texte dans 3 conversations ou plus en moins de 2 h.
	const groupes = {};
	for (const m of coach) {
		if (m.kind || estAccueil(m)) continue;
		const cle = m.text.replace(/\s+/g, " ").trim().toLowerCase().split(" ").slice(2, 30).join(" ");
		if (cle.length >= 40) (groupes[cle] ||= []).push(m);
	}
	for (const g of Object.values(groupes)) {
		if (new Set(g.map((m) => m.uid)).size >= 3 && g.at(-1).createdAt - g[0].createdAt < 2 * H) g.forEach((m) => (m.annonceDetectee = true));
	}
	const estAnnonce = (m) => m.kind === "announcement" || m.annonceDetectee;
	const repond = (m) => m.qui === "coach" && !estAnnonce(m) && !estAccueil(m);

	// Séries et délais.
	const ecarts = [];
	const delais = [];
	const delaisSemaine = [];
	const delaisWeekEnd = [];
	let seriesSansReponse = 0;
	for (const msgs of Object.values(conv)) {
		let serie = null;
		const clore = (reponse) => {
			if (!serie) return;
			const debut = serie.msgs[0].createdAt;
			if (debut >= DEBUT && debut <= FIN - 3 * J) {
				for (let i = 1; i < serie.msgs.length; i++) ecarts.push(serie.msgs[i].createdAt - serie.msgs[i - 1].createdAt);
				const depart = serie.msgs.find((m) => !estAck(m.text));
				if (depart && reponse) {
					const x = reponse.createdAt - depart.createdAt;
					delais.push(x);
					(weekEnd(depart.createdAt) ? delaisWeekEnd : delaisSemaine).push(x);
				} else if (depart && !reponse) seriesSansReponse++;
			}
			serie = null;
		};
		for (const m of msgs) {
			if (m.createdAt > FIN) break;
			if (m.qui === "triathlete") (serie ||= { msgs: [] }).msgs.push(m);
			else if (repond(m)) clore(m);
		}
		clore(null);
	}

	// Actifs qui écrivent, messages jamais lus.
	const actifs = Object.keys(users).filter((u) => users[u].actif);
	const ecrivent = actifs.filter((u) => (conv[u] || []).some((m) => m.qui === "triathlete" && m.createdAt >= FIN - 30 * J && m.createdAt <= FIN));
	const aLire = coach.filter((m) => users[m.uid].actif && !estAnnonce(m) && m.createdAt >= DEBUT && m.createdAt <= FIN - 7 * J);

	// Critère de retrait du « Lu » (fiche §1) : « tu as lu mais tu ne réponds pas ». Repérage par mots, à relire.
	const RELANCE =
		/(as|avez|t.as) (bien )?(lu|vu) (mon|mes|le)|vu mon message|lu mon message|pas de r[ée]ponse|toujours pas (eu )?de r[ée]ponse|sans r[ée]ponse|tu es l[àa] \?|des nouvelles \?|read my message|seen my message|no (reply|answer)/i;
	const relances = Object.values(conv)
		.flat()
		.filter((m) => m.qui === "triathlete" && m.createdAt >= DEBUT && m.createdAt <= FIN && RELANCE.test(m.text));

	const debutTxt = new Date(DEBUT).toISOString().slice(0, 10);
	const finTxt = new Date(FIN).toISOString().slice(0, 10);
	console.log(`Fenêtre : ${JOURS} jours, du ${debutTxt} au ${finTxt} · ${actifs.length} actifs`);
	console.log(`1. Écarts de plus de 6 h dans les séries : ${pct(ecarts.filter((x) => x > 6 * H).length, ecarts.length)} (${ecarts.length} écarts)`);
	console.log(`2. Délai de réponse : médiane ${heures(quantile(delais, 0.5))} · p90 ${heures(quantile(delais, 0.9))} · sous 48 h ${pct(delais.filter((x) => x <= 48 * H).length, delais.length)} (${delais.length} séries, ${seriesSansReponse} sans réponse)`);
	console.log(`   semaine : médiane ${heures(quantile(delaisSemaine, 0.5))} (${delaisSemaine.length}) · week-end : médiane ${heures(quantile(delaisWeekEnd, 0.5))} (${delaisWeekEnd.length})`);
	console.log(`3. Actifs qui ont écrit sur les 30 derniers jours : ${ecrivent.length}/${actifs.length} (${pct(ecrivent.length, actifs.length)})`);
	console.log(`4. Messages de Coach Kona jamais lus, hors annonces, chez les actifs : ${pct(aLire.filter((m) => !m.seen).length, aLire.length)} (${aLire.length} messages)`);
	console.log(`5. Messages « tu as lu / pas de réponse » : ${relances.length}`);
	for (const m of relances) console.log(`   ${new Date(m.createdAt).toISOString().slice(0, 10)} · ${m.text.slice(0, 100).replace(/\n/g, " ")}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
