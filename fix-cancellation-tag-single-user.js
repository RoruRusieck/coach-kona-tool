// Script ONE-SHOT — pose rc_cancellation_at sur un user en essai qui a annulé (Firestore :
// willRenew false, sans billingIssue, donc un CANCELLATION) mais n'a jamais reçu le tag : sans
// lui, le rappel J-1 « tu seras prélevé demain » partirait alors qu'il ne sera pas prélevé.
// Cas trouvé le 29/09 au contrôle du rattrapage rc_trial_end_at (jehf…, fin d'essai le 14/10).
//
// La vraie date d'annulation est inconnue (event non retrouvé dans les logs) : le tag reçoit la
// date de la correction. Sans conséquence, le journey ne teste que la présence du tag.
//
// Usage : ONESIGNAL_API_KEY="Key …" node fix-cancellation-tag-single-user.js --dry-run   puis sans --dry-run

const ONESIGNAL_APP_ID = "c1b9d514-b98f-4186-a08a-9e6abea70d37";
// Clé REST OneSignal lue dans l'environnement (ex. ONESIGNAL_API_KEY="Key os_v2_…"), pas en dur.
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
if (!ONESIGNAL_API_KEY) {
  console.error("ONESIGNAL_API_KEY manquant dans l'environnement.");
  process.exit(1);
}

const UID = "jehfGA0VLGhwI5sGi2xpAWu3Ot52";

const DRY_RUN = process.argv.includes("--dry-run");

const url = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${UID}`;

async function readTags() {
  const res = await fetch(url, { headers: { Authorization: ONESIGNAL_API_KEY } });
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  return (await res.json()).properties?.tags || {};
}

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN — aucune écriture ===\n" : "=== EXECUTION REELLE ===\n");

  const before = await readTags();
  console.log("Tags actuels :", JSON.stringify(before));

  if (before.rc_cancellation_at) {
    console.log("\nrc_cancellation_at déjà présent, rien à faire.");
    return;
  }

  const value = new Date().toISOString();
  if (DRY_RUN) {
    console.log(`\nPoserait rc_cancellation_at = ${value}`);
    console.log("Relancer sans --dry-run pour exécuter réellement.");
    return;
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { tags: { rc_cancellation_at: value } } }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);

  const after = await readTags();
  console.log("\nTags après :", JSON.stringify(after));
  console.log(after.rc_cancellation_at ? "\nOK, rc_cancellation_at posé." : "\nÉCHEC, tag absent après écriture.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
