// Script ONE-SHOT — passe en secondes Unix les tags OneSignal datés encore en ISO (08/10/2026).
//
// Jusqu'à la 1.37.1 (app) et au déploiement du 08/10 (infra), seul rc_trial_end_at était en Unix :
// les autres dates partaient en ISO, que les opérateurs de temps OneSignal lisent comme du texte
// (la condition échoue sans erreur). Le script relit les tags de chaque user dans OneSignal et
// réécrit la même date en Unix, sans passer par Firestore : la valeur reste celle du tag.
//
// Relançable sans risque : un tag déjà en Unix n'est pas touché. Les versions de l'app < 1.37.1
// réécrivent signup_at et email_optin_at en ISO à chaque lancement : le relancer une fois la 1.37.1
// bien installée.
//
// Simulation par défaut. Usage : ONESIGNAL_API_KEY="Key …" node backfill-tags-unix.js [--apply]

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

const APPLY = process.argv.includes("--apply");

const TAGS_DATES = [
  "signup_at",
  "onboarding_form_start_at",
  "onboarding_form_submit_at",
  "email_optin_at",
  "first_program_delivered_at",
  "rc_trial_start_at",
  "purchase_at",
  "rc_cancellation_at",
];

const urlUser = (externalId) =>
  `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`;

async function lireTags(externalId) {
  const res = await fetch(urlUser(externalId), { headers: { Authorization: ONESIGNAL_API_KEY } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()).properties?.tags ?? {};
}

async function ecrireTags(externalId, tags) {
  const res = await fetch(urlUser(externalId), {
    method: "PATCH",
    headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { tags } }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

/** Les tags datés encore en ISO, convertis ; les valeurs illisibles à part. */
function conversions(tags) {
  const aEcrire = {};
  const illisibles = {};
  for (const nom of TAGS_DATES) {
    const valeur = tags[nom];
    if (!valeur || /^\d+$/.test(valeur)) continue;
    const ms = Date.parse(valeur);
    if (Number.isNaN(ms)) illisibles[nom] = valeur;
    else aEcrire[nom] = String(Math.floor(ms / 1000));
  }
  return { aEcrire, illisibles };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log(APPLY ? "=== EXECUTION REELLE ===\n" : "=== SIMULATION — aucune écriture ===\n");

  const snap = await db.collection("users").select().get();
  console.log(`${snap.size} users dans Firestore.\n`);

  const parTag = Object.fromEntries(TAGS_DATES.map((t) => [t, 0]));
  let sansOneSignal = 0;
  let dejaBons = 0;
  let ecrits = 0;
  let aTraiter = 0;
  const exemples = [];
  const illisibles = [];
  const erreurs = [];

  for (const doc of snap.docs) {
    try {
      const tags = await lireTags(doc.id);
      if (!tags) {
        sansOneSignal++;
      } else {
        const c = conversions(tags);
        if (Object.keys(c.illisibles).length) illisibles.push({ uid: doc.id, ...c.illisibles });
        if (!Object.keys(c.aEcrire).length) {
          dejaBons++;
        } else {
          aTraiter++;
          Object.keys(c.aEcrire).forEach((t) => parTag[t]++);
          if (exemples.length < 3) exemples.push({ uid: doc.id, avant: tags, apres: c.aEcrire });
          if (APPLY) {
            await ecrireTags(doc.id, c.aEcrire);
            ecrits++;
          }
        }
      }
    } catch (e) {
      erreurs.push(doc.id);
      console.error(`Échec pour ${doc.id}:`, e.message);
    }
    await pause(100);
  }

  console.log(`Users avec au moins un tag ISO : ${aTraiter}${APPLY ? ` (${ecrits} réécrits)` : ""}`);
  for (const [t, n] of Object.entries(parTag)) console.log(`  ${t.padEnd(28)} ${n}`);
  console.log(`\nDéjà en Unix ou sans tag daté : ${dejaBons}`);
  console.log(`Absents de OneSignal (pas d'external_id) : ${sansOneSignal}`);
  console.log(`Valeurs illisibles, laissées telles quelles : ${illisibles.length}`);
  illisibles.forEach((u) => console.log(`  ${JSON.stringify(u)}`));
  console.log(`Erreurs : ${erreurs.length}`);
  console.log("\nExemples :");
  exemples.forEach((e) => console.log(`  ${e.uid}\n    avant ${JSON.stringify(e.avant)}\n    après ${JSON.stringify(e.apres)}`));
  if (!APPLY) console.log("\nRelancer avec --apply pour exécuter réellement.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
