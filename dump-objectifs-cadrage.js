// Lecture seule. Export pour le cadrage de la refonte de l'onglet Objectifs (25/10/2026) :
// objectifs des comptes (primary, secondary, archives), abonnement, programmes avec leurs cycles et
// leurs séances (date, statut, type), validations du back-office, et l'état RevenueCat (dates de
// résiliation) des comptes qui ont eu un accès. Écrit un JSON dans le chemin passé en argument, à
// analyser hors ligne. Rien n'est modifié, ni en base ni dans RevenueCat (GET seulement).
//
// Usage : node dump-objectifs-cadrage.js /chemin/sortie.json

const admin = require("firebase-admin");
const fs = require("fs");
const https = require("https");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// La clé secrète de l'API RevenueCat, jamais en dur : `RC_API_KEY=sk_… node dump-objectifs-cadrage.js …`.
const RC_API_KEY = process.env.RC_API_KEY;
if (!RC_API_KEY) throw new Error("RC_API_KEY manquante (clé secrète de l'API RevenueCat, en variable d'environnement)");

const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : null);
const pause = (n) => new Promise((r) => setTimeout(r, n));

function fetchRC(uid) {
	return new Promise((resolve, reject) => {
		const req = https.request(
			{
				hostname: "api.revenuecat.com",
				path: `/v1/subscribers/${encodeURIComponent(uid)}`,
				method: "GET",
				headers: { Authorization: `Bearer ${RC_API_KEY}`, "Content-Type": "application/json" },
			},
			(res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => {
					if (res.statusCode === 200) resolve(JSON.parse(data));
					else if (res.statusCode === 404) resolve(null);
					else reject(new Error(`RC ${res.statusCode}: ${data.slice(0, 200)}`));
				});
			},
		);
		req.on("error", reject);
		req.end();
	});
}

async function main() {
	const sortie = process.argv[2];
	if (!sortie) throw new Error("chemin de sortie manquant");

	const usersSnap = await db.collection("users").get();
	const users = {};
	for (const d of usersSnap.docs) {
		const u = d.data();
		const s = u.subscription || {};
		users[d.id] = {
			role: u.role ?? null,
			email: (u.email || "").toLowerCase(),
			firstname: u.firstname ?? null,
			asCompleteForm: !!u.asCompleteForm,
			formCompletedAt: ms(u.formCompletedAt) ?? u.formCompletedAt ?? null,
			createdAt: ms(u.createdAt) ?? u.createdAt ?? null,
			trainingStartDate: u.trainingStartDate ?? null,
			onboardingVersion: u.onboardingVersion ?? null,
			language: u.language ?? null,
			sub: {
				hasAccess: s.hasAccess ?? null,
				isInTrial: s.isInTrial ?? null,
				expiresAt: s.expiresAt ?? null,
				willRenew: s.willRenew ?? null,
				isBeta: s.isBeta ?? null,
				hasManualAccess: s.hasManualAccess ?? null,
				trialExpiresAt: s.trial?.expiresAt ?? null,
			},
			triathlonGoals: u.triathlonGoals ?? null,
			programs: [],
		};

		const progs = await d.ref.collection("programs").get();
		for (const p of progs.docs) {
			const x = p.data();
			const sess = await p.ref.collection("sessions").get();
			users[d.id].programs.push({
				id: p.id,
				status: x.status ?? null,
				startDate: x.startDate ?? null,
				endDate: x.endDate ?? null,
				generatedUntil: x.generatedUntil ?? null,
				generatedAt: x.generatedAt ?? null,
				createdAt: ms(x.createdAt) ?? x.createdAt ?? null,
				updatedAt: ms(x.updatedAt) ?? x.updatedAt ?? null,
				objectif: x.context?.objectif ?? null,
				cycles: (Array.isArray(x.cycles) ? x.cycles : []).map((c) => ({
					title: c.title ?? null,
					subtitle: c.subtitle ?? null,
					kind: c.kind ?? null,
					startDate: c.startDate ?? null,
					endDate: c.endDate ?? null,
					content: typeof c.content === "string" ? c.content : null,
				})),
				sessions: sess.docs.map((s) => {
					const y = s.data();
					return {
						date: y.date ?? null,
						status: y.status ?? null,
						type: y.type ?? null,
						title: y.title ?? null,
						validatedAt: ms(y.validatedAt) ?? ms(y.completedAt) ?? null,
					};
				}),
			});
		}
	}

	const pendSnap = await db.collection("pendingValidations").get();
	const pendings = pendSnap.docs.map((d) => {
		const p = d.data();
		const prog = p.payload?.program;
		// `payload.program` est le programme lui-même (anciens pendings : parfois rangé par programId).
		const premier = prog && typeof prog === "object"
			? ("cycles" in prog ? prog : Object.values(prog.programs ?? prog).find((v) => v && typeof v === "object" && "cycles" in v) ?? null)
			: null;
		return {
			id: d.id,
			type: p.type ?? null,
			athlete_id: p.athlete_id ?? null,
			status: p.status ?? null,
			createdAt: ms(p.createdAt),
			updatedAt: ms(p.updatedAt),
			payloadKeys: p.payload && typeof p.payload === "object" ? Object.keys(p.payload) : [],
			programEndDate: premier?.endDate ?? null,
			programStartDate: premier?.startDate ?? null,
			programObjectif: premier?.context?.objectif ?? null,
			nbCycles: Array.isArray(premier?.cycles) ? premier.cycles.length : null,
		};
	});

	// RevenueCat : les comptes qui ont une trace d'accès store ou d'essai.
	const rc = {};
	const cibles = Object.entries(users).filter(([, u]) => u.sub.hasAccess !== null || u.sub.expiresAt || u.sub.trialExpiresAt || u.sub.willRenew !== null);
	for (const [uid] of cibles) {
		try {
			const r = await fetchRC(uid);
			const subs = r?.subscriber?.subscriptions ?? {};
			rc[uid] = Object.entries(subs).map(([produit, a]) => ({
				produit,
				store: a.store ?? null,
				periodType: a.period_type ?? null,
				purchaseDate: a.purchase_date ?? null,
				originalPurchaseDate: a.original_purchase_date ?? null,
				expiresDate: a.expires_date ?? null,
				unsubscribeDetectedAt: a.unsubscribe_detected_at ?? null,
				billingIssuesDetectedAt: a.billing_issues_detected_at ?? null,
				refundedAt: a.refunded_at ?? null,
				isSandbox: a.is_sandbox ?? null,
			}));
		} catch (e) {
			rc[uid] = { erreur: e.message };
		}
		await pause(120);
	}

	fs.writeFileSync(sortie, JSON.stringify({ exportedAt: Date.now(), users, pendings, rc }));
	const nbProgs = Object.values(users).reduce((a, u) => a + u.programs.length, 0);
	console.log(`users ${usersSnap.size} · programmes ${nbProgs} · pendings ${pendings.length} · RC ${Object.keys(rc).length}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
