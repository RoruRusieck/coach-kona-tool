// Script ONE-SHOT — rattrapage des tags OneSignal pour les essais déjà en cours au moment du
// déploiement du 29/09 (le webhook RC ne pose rc_trial_end_at qu'au démarrage d'un essai) :
//   - rc_trial_end_at = subscription.expiresAt, en secondes Unix (format exigé par les
//     opérateurs de temps OneSignal, c'est lui qui déclenche le rappel J-1) ;
//   - rc_cancellation_at vidé si willRenew === true : un user qui a annulé puis réactivé a gardé
//     le tag (jamais effacé avant ce déploiement), il serait exclu du rappel et prélevé sans prévenir.
// À lancer APRÈS cleanup-session-completed-tag.js (plafond de tags par user). À supprimer ensuite.
//
// Usage : ONESIGNAL_API_KEY="Key …" node backfill-trial-end-tag.js --dry-run   puis sans --dry-run

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

async function setTags(externalId, tags) {
  const res = await fetch(
    `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`,
    {
      method: "PATCH",
      headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { tags } }),
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

  const snap = await db.collection("users").where("subscription.isInTrial", "==", true).get();
  console.log(`${snap.size} users avec subscription.isInTrial === true.\n`);

  const now = Date.now();
  const toTag = [];
  const missingExpiresAt = [];
  const alreadyExpired = [];

  snap.forEach((doc) => {
    const sub = doc.data().subscription || {};
    const expiresMs = sub.expiresAt ? Date.parse(sub.expiresAt) : NaN;
    if (Number.isNaN(expiresMs)) {
      missingExpiresAt.push(doc.id);
      return;
    }
    // isInTrial resté à true avec un essai fini = webhook EXPIRATION perdu : pas de date passée.
    if (expiresMs <= now) {
      alreadyExpired.push({ uid: doc.id, expiresAt: sub.expiresAt });
      return;
    }
    const tags = { rc_trial_end_at: String(Math.floor(expiresMs / 1000)) };
    if (sub.willRenew === true) tags.rc_cancellation_at = "";
    toTag.push({ uid: doc.id, expiresAt: sub.expiresAt, tags });
  });

  console.log(`À taguer : ${toTag.length}`);
  toTag.forEach((u) => console.log(`  ${u.uid}  fin ${u.expiresAt}  ${JSON.stringify(u.tags)}`));
  console.log(`\nÀ vérifier à la main — isInTrial sans expiresAt exploitable : ${missingExpiresAt.length}`);
  missingExpiresAt.forEach((uid) => console.log(`  ${uid}`));
  console.log(`\nIgnorés — essai déjà terminé (EXPIRATION probablement perdu) : ${alreadyExpired.length}`);
  alreadyExpired.forEach((u) => console.log(`  ${u.uid}  fin ${u.expiresAt}`));

  if (DRY_RUN) {
    console.log("\nRelancer sans --dry-run pour exécuter réellement.");
    return;
  }

  let done = 0;
  const noExternalId = [];
  const errors = [];
  for (const u of toTag) {
    try {
      const result = await setTags(u.uid, u.tags);
      if (result === "no_external_id") noExternalId.push(u.uid);
      else done++;
    } catch (e) {
      errors.push(u.uid);
      console.error(`Échec pour ${u.uid}:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nTerminé. ${done} taguées, ${errors.length} erreurs.`);
  console.log(`Pas d'external_id dans OneSignal (pas de J-1 possible) : ${noExternalId.length}`);
  noExternalId.forEach((uid) => console.log(`  ${uid}`));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
