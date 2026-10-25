// Lecture seule. Export de la messagerie pour le cadrage de la refonte de l'onglet Messages (23/10/2026) :
// toutes les conversations (chats/{uid}/messages), toutes les validations du back-office
// (pendingValidations) et l'état d'abonnement des comptes. Écrit un JSON dans le chemin passé en
// argument, à analyser ensuite hors ligne. Rien n'est modifié en base.
//
// Usage : node dump-messages-cadrage.js /chemin/sortie.json

const admin = require("firebase-admin");
const fs = require("fs");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : null);
const texte = (p) => {
	if (typeof p === "string") return p;
	if (p && typeof p === "object") {
		for (const k of ["suggestion", "message", "text", "content"]) if (typeof p[k] === "string") return p[k];
	}
	return null;
};

async function main() {
	const sortie = process.argv[2];
	if (!sortie) throw new Error("chemin de sortie manquant");

	const usersSnap = await db.collection("users").get();
	const users = {};
	usersSnap.forEach((d) => {
		const u = d.data();
		const s = u.subscription || {};
		users[d.id] = {
			role: u.role ?? null,
			email: (u.email || "").toLowerCase(),
			asCompleteForm: !!u.asCompleteForm,
			formCompletedAt: ms(u.formCompletedAt) ?? u.formCompletedAt ?? null,
			trainingStartDate: u.trainingStartDate ?? null,
			language: u.language ?? null,
			sub: {
				hasAccess: s.hasAccess ?? null,
				isInTrial: s.isInTrial ?? null,
				expiresAt: s.expiresAt ?? null,
				isBeta: s.isBeta ?? null,
				hasManualAccess: s.hasManualAccess ?? null,
				trialExpiresAt: s.trial?.expiresAt ?? null,
			},
		};
	});

	const chatsSnap = await db.collection("chats").get();
	const chats = {};
	for (const c of chatsSnap.docs) {
		const msgs = await c.ref.collection("messages").get();
		chats[c.id] = {
			champsChat: Object.keys(c.data()),
			markedUnreadByAdmin: c.data().markedUnreadByAdmin ?? null,
			messages: msgs.docs.map((m) => {
				const x = m.data();
				return {
					id: m.id,
					champs: Object.keys(x),
					senderId: x.senderId ?? null,
					createdAt: ms(x.createdAt),
					editedAt: ms(x.editedAt),
					seen: x.seen ?? null,
					text: x.text ?? "",
				};
			}),
		};
	}

	const pendSnap = await db.collection("pendingValidations").get();
	const pendings = pendSnap.docs.map((d) => {
		const p = d.data();
		return {
			id: d.id,
			type: p.type ?? null,
			athlete_id: p.athlete_id ?? null,
			status: p.status ?? null,
			createdAt: ms(p.createdAt),
			updatedAt: ms(p.updatedAt),
			suggestion: texte(p.payload),
			payloadKeys: p.payload && typeof p.payload === "object" ? Object.keys(p.payload) : [],
		};
	});

	fs.writeFileSync(sortie, JSON.stringify({ exportedAt: Date.now(), users, chats, pendings }));
	const nbMsgs = Object.values(chats).reduce((a, c) => a + c.messages.length, 0);
	console.log(`users ${usersSnap.size} · chats ${chatsSnap.size} · messages ${nbMsgs} · pendings ${pendings.length}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
