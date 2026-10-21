/**
 * Lecture seule. Qui peut recevoir une notification push ? Pour chaque abonné (formulaire terminé),
 * l'état de son contact OneSignal : abonnement push de production actif, email dans le contact (bloqué
 * par le bug du canal jusqu'au 21/10), ou aucun push actif (permission jamais donnée, app désinstallée,
 * demande de permission cassée depuis la 1.36.0…). 21/10/2026.
 *
 * Aucune donnée personnelle affichée. Clé OneSignal : ONESIGNAL_API_KEY dans l'environnement.
 *
 * Usage : ONESIGNAL_API_KEY="Key …" node audit-push-onesignal.js
 */
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./keys/firebaseKey.json")) });
const db = admin.firestore();

const APP = "c1b9d514-b98f-4186-a08a-9e6abea70d37";
const CLE = process.env.ONESIGNAL_API_KEY;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const accesActif = (sub, maintenant = new Date()) => {
	if (!sub) return false;
	if (sub.isBeta || sub.hasManualAccess) return true;
	if (sub.expiresAt && new Date(sub.expiresAt) > maintenant) return true;
	if (sub.trial?.expiresAt && !sub.trial.expired && new Date(sub.trial.expiresAt) > maintenant) return true;
	return false;
};

(async () => {
	if (!CLE) throw new Error("ONESIGNAL_API_KEY manquante");
	const fiches = await db.collection("users").where("asCompleteForm", "==", true).get();
	const actifs = fiches.docs.filter((d) => accesActif(d.data().subscription) && d.data().role !== "ADMIN");
	const comptes = { total: actifs.length, pushProdActif: 0, pushDevSeulement: 0, aucunPushActif: 0, avecEmail: 0, inconnuOneSignal: 0 };
	const parVersion = {};
	for (const d of actifs) {
		const r = await fetch(`https://api.onesignal.com/apps/${APP}/users/by/external_id/${d.id}`, { headers: { Authorization: CLE } });
		if (r.status === 404) {
			comptes.inconnuOneSignal++;
			continue;
		}
		const u = await r.json();
		const subs = u.subscriptions ?? [];
		if (subs.some((s) => s.type === "Email")) comptes.avecEmail++;
		const push = subs.filter((s) => s.type === "iOSPush" || s.type === "AndroidPush");
		const actifsPush = push.filter((s) => s.enabled);
		// test_type n'est pas dans ce endpoint : un build de dev a un app_version et un token sandbox ; on s'en
		// tient à « actif ou non » ici, le compte de test étant le seul build de dev connu.
		if (actifsPush.length) comptes.pushProdActif++;
		else comptes.aucunPushActif++;
		const derniere = push.sort((a, b) => (b.app_version ?? "").localeCompare(a.app_version ?? ""))[0];
		const v = derniere?.app_version ?? "aucune";
		parVersion[v] = parVersion[v] ?? { total: 0, sansPushActif: 0 };
		parVersion[v].total++;
		if (!actifsPush.length) parVersion[v].sansPushActif++;
		await attendre(120);
	}
	delete comptes.pushDevSeulement;
	console.log(comptes);
	console.log("Par version de l'app (dernière installation) :");
	for (const [v, c] of Object.entries(parVersion).sort()) console.log(`  ${v.padEnd(8)} ${c.total} abonnés, dont ${c.sansPushActif} sans push actif`);
	process.exit(0);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
