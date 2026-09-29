// Script TEMPORAIRE — enregistre dans OneSignal l'adresse email de tous les users Firestore,
// consentants ou non. À lancer chaque matin jusqu'au prochain build (qui fait la même chose côté
// app, branche feature/optin-conseils-seuls), puis à supprimer. Le premier passage rattrape
// les ~700 adresses existantes.
//
// L'adresse sert au rappel de fin d'essai (exécution du contrat, envoyé à tous). Le consentement
// marketing, c'est le tag email_optin_at, et lui seul. NE PAS LANCER avant que Ben et Nami aient
// confirmé que toutes les séquences marketing filtrent sur email_optin_at : sinon elles partent
// à ~690 personnes qui n'ont pas consenti.
//
// Usage : ONESIGNAL_API_KEY="Key …" node sync-emails-onesignal.js --dry-run   puis sans --dry-run

const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const ONESIGNAL_APP_ID = "c1b9d514-b98f-4186-a08a-9e6abea70d37";
// Clé REST OneSignal lue dans l'environnement (ex. ONESIGNAL_API_KEY="Key os_v2_…"), pas en dur.
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
if (!ONESIGNAL_API_KEY) {
  console.error("ONESIGNAL_API_KEY manquant dans l'environnement.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

async function addEmail(externalId, email) {
  const res = await fetch(
    `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}/subscriptions`,
    {
      method: "POST",
      headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: { type: "Email", token: email } }),
    },
  );
  if (res.status === 404) return "no_external_id";
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return "ok";
}

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN — aucune écriture ===\n" : "=== EXECUTION REELLE ===\n");

  const snap = await db.collection("users").get();

  const byEmail = new Map();
  let withoutEmail = 0;
  snap.forEach((doc) => {
    const email = (doc.data().email || "").trim().toLowerCase();
    if (!email) {
      withoutEmail++;
      return;
    }
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(doc.id);
  });

  // Une adresse déjà enregistrée ailleurs est transférée au user visé par l'appel : deux comptes
  // Firestore avec la même adresse se la voleraient à chaque passage. On les laisse de côté.
  const toSync = [];
  const sharedEmails = [];
  byEmail.forEach((uids, email) => {
    if (uids.length > 1) sharedEmails.push({ email, uids });
    else toSync.push({ uid: uids[0], email });
  });

  console.log(`${snap.size} users, ${withoutEmail} sans email.`);
  console.log(`À synchroniser : ${toSync.length}`);
  console.log(`Ignorés — adresse partagée par plusieurs comptes : ${sharedEmails.length}`);
  sharedEmails.forEach((s) => console.log(`  ${s.email}  ${s.uids.join(", ")}`));

  if (DRY_RUN) {
    console.log("\nRelancer sans --dry-run pour exécuter réellement.");
    return;
  }

  let done = 0;
  let noExternalId = 0;
  let errors = 0;
  for (const u of toSync) {
    try {
      const result = await addEmail(u.uid, u.email);
      if (result === "no_external_id") noExternalId++;
      else done++;
    } catch (e) {
      errors++;
      console.error(`Échec pour ${u.uid}:`, e.message);
    }
    if ((done + noExternalId + errors) % 50 === 0) {
      console.log(`  ${done + noExternalId + errors}/${toSync.length} traités (${errors} erreurs)`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nTerminé. ${done} adresses enregistrées, ${noExternalId} sans external_id, ${errors} erreurs.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
