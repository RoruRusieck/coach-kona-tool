const admin = require("firebase-admin");
const serviceAccount = require("./keys/firebaseKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ⚙️ CONFIG
const DRY_RUN = false;       // false pour écrire en base
const TEST_UID = "";        // UID d'un seul user — laisser vide pour tous

// generatedUntil = date de la dernière séance générée (toujours un dimanche),
// PAS de transformation "lundi suivant + 13j" — celle-ci est appliquée à la
// LECTURE par code-node-renouvellement.js pour calculer la fenêtre suivante.
function computeGeneratedUntil(sessions) {
  if (!sessions.length) return null;

  return sessions
    .map((s) => s.date)
    .reduce((max, d) => (d > max ? d : max));
}

async function migrateUser(userDoc) {
  const programsSnap = await userDoc.ref
    .collection("programs")
    .where("status", "==", "OPEN")
    .get();

  if (programsSnap.empty) {
    console.log(`  ${userDoc.id} — aucun programme OPEN`);
    return;
  }

  for (const programDoc of programsSnap.docs) {
    const existing = programDoc.data().generatedUntil;

    const sessionsSnap = await programDoc.ref.collection("sessions").get();
    const sessions = sessionsSnap.docs.map((d) => d.data());
    const generatedUntil = computeGeneratedUntil(sessions);

    if (!generatedUntil) {
      console.log(`  ${userDoc.id} / ${programDoc.id} — aucune session, skip`);
      continue;
    }

    if (existing === generatedUntil) {
      console.log(`  ${userDoc.id} / ${programDoc.id} — déjà correct (${generatedUntil}), skip`);
      continue;
    }

    console.log(
      `  ${userDoc.id} / ${programDoc.id} — generatedUntil : ${existing ?? "(absent)"} → ${generatedUntil}${DRY_RUN ? " [DRY RUN]" : " → écrit"}`
    );

    if (!DRY_RUN) {
      await programDoc.ref.update({ generatedUntil });
    }
  }
}

async function run() {
  console.log(`Mode : ${DRY_RUN ? "DRY RUN (aucune écriture)" : "ÉCRITURE EN BASE"}`);
  console.log(`Scope : ${TEST_UID ? `user ${TEST_UID}` : "tous les users"}\n`);

  if (TEST_UID) {
    const userDoc = await db.collection("users").doc(TEST_UID).get();
    if (!userDoc.exists) {
      console.error(`User ${TEST_UID} introuvable`);
      process.exit(1);
    }
    await migrateUser(userDoc);
  } else {
    const usersSnap = await db.collection("users").get();
    console.log(`${usersSnap.size} users à traiter\n`);
    for (const userDoc of usersSnap.docs) {
      await migrateUser(userDoc);
    }
  }

  console.log("\nTerminé.");
  process.exit(0);
}

run();
