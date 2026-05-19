const admin = require("firebase-admin");
const https = require("https");

const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const RC_API_KEY = "sk_uoIevxneocWJaYMGujWfnTuyBLjcu";
const ENTITLEMENT = "Coach Kona Premium";

function fetchRCSubscriber(uid) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: "api.revenuecat.com",
			path: `/v1/subscribers/${uid}`,
			method: "GET",
			headers: {
				Authorization: `Bearer ${RC_API_KEY}`,
				"Content-Type": "application/json",
			},
		};

		const req = https.request(options, (res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				if (res.statusCode === 200) {
					resolve(JSON.parse(data));
				} else if (res.statusCode === 404) {
					resolve(null);
				} else {
					reject(new Error(`RC API error ${res.statusCode}: ${data}`));
				}
			});
		});

		req.on("error", reject);
		req.end();
	});
}

async function syncUser(uid) {
	const userRef = db.collection("users").doc(uid);
	const userSnap = await userRef.get();

	if (!userSnap.exists) {
		console.log(`⚠️  [${uid}] User introuvable dans Firestore — ignoré`);
		return;
	}

	const userData = userSnap.data();

	const subscriptionData = userData.subscription || {};
	const currentHasManualAccess = subscriptionData.hasManualAccess === true;

	if (userData.subscription?.isBeta === true || currentHasManualAccess) {
		const reason = userData.subscription?.isBeta === true ? "isBeta=true" : "hasManualAccess=true";
		if (!subscriptionData.hasAccess) {
			await userRef.update({ "subscription.hasAccess": true });
		}
		console.log(`🛡️  [${uid}] ${reason} — hasAccess forcé à true`);
		return;
	}

	const rcData = await fetchRCSubscriber(uid);

	let hasAccess = false;
	let expiresAt = null;

	if (rcData) {
		const entitlement = rcData.subscriber?.entitlements?.[ENTITLEMENT];
		if (entitlement && entitlement.expires_date) {
			const expiry = new Date(entitlement.expires_date);
			if (expiry > new Date()) {
				hasAccess = true;
				expiresAt = expiry.toISOString();
			}
		}
	}

	const update = {
		"subscription.hasAccess": hasAccess,
		"subscription.expiresAt": expiresAt,
		"subscription.hasManualAccess": false,
	};

	await userRef.update(update);

	console.log(
		`✅ [${uid}] hasAccess=${hasAccess} expiresAt=${expiresAt ?? "null"} hasManualAccess=false`
	);
}

async function syncAll() {
	const usersSnap = await db.collection("users").get();
	const uids = usersSnap.docs.map((doc) => doc.id);
	console.log(`🔄 Sync de ${uids.length} users...`);

	for (const uid of uids) {
		await syncUser(uid);
	}

	console.log("✅ Sync terminée.");
}

async function main() {
	const arg = process.argv[2];

	if (!arg) {
		console.error("Usage : node sync-subscriptions.js <UID> | --all");
		process.exit(1);
	}

	if (arg === "--all") {
		await syncAll();
	} else {
		await syncUser(arg);
	}

	process.exit(0);
}

main().catch((err) => {
	console.error("❌ Erreur :", err);
	process.exit(1);
});
