// Script ONE-SHOT — vide le tag OneSignal session_completed_at (valeur vide = suppression) sur
// tous les comptes avec external_id. Le tag est retiré le 29/09 au profit de rc_trial_end_at,
// budget à 10 tags : à lancer AVANT backfill-trial-end-tag.js et avant le déploiement des Cloud
// Functions, sinon les comptes qui l'ont encore passent à 11 tags (plafond par user dépassé,
// login() peut échouer en silence). À lancer une fois, puis à supprimer.
//
// Usage : ONESIGNAL_API_KEY="Key …" node cleanup-session-completed-tag.js --dry-run   puis sans --dry-run

const zlib = require("zlib");

const ONESIGNAL_APP_ID = "c1b9d514-b98f-4186-a08a-9e6abea70d37";
// Clé REST OneSignal lue dans l'environnement (ex. ONESIGNAL_API_KEY="Key os_v2_…"), pas en dur.
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
if (!ONESIGNAL_API_KEY) {
  console.error("ONESIGNAL_API_KEY manquant dans l'environnement.");
  process.exit(1);
}

const TAG_TO_CLEAR = "session_completed_at";

const DRY_RUN = process.argv.includes("--dry-run");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

async function getExternalIds() {
  const trigger = await fetch(`https://api.onesignal.com/players/csv_export?app_id=${ONESIGNAL_APP_ID}`, {
    method: "POST",
    headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ extra_fields: ["external_user_id"] }),
  });
  const triggerData = await trigger.json();
  let csvText = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 4000));
    const fileRes = await fetch(triggerData.csv_file_url);
    if (fileRes.status === 200) {
      const buf = Buffer.from(await fileRes.arrayBuffer());
      csvText = zlib.gunzipSync(buf).toString("utf8");
      break;
    }
  }
  if (!csvText) throw new Error("Export CSV jamais prêt");

  const rows = parseCsv(csvText);
  const header = rows[0];
  const idxExt = header.indexOf("external_user_id");
  // Un même external_id peut apparaître sur plusieurs lignes (un par appareil) : dédoublonné.
  const ids = new Set();
  rows.slice(1).forEach((r) => {
    const v = r[idxExt];
    if (v && v.trim() !== "") ids.add(v.trim());
  });
  return [...ids];
}

async function clearTagForUser(externalId) {
  const res = await fetch(
    `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`,
    {
      method: "PATCH",
      headers: { Authorization: ONESIGNAL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { tags: { [TAG_TO_CLEAR]: "" } } }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
}

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN — aucune écriture ===\n" : "=== EXECUTION REELLE ===\n");

  const ids = await getExternalIds();
  console.log(`${ids.length} comptes avec external_id trouvés.\n`);

  if (DRY_RUN) {
    console.log(`Tag qui serait vidé sur chaque compte : ${TAG_TO_CLEAR}`);
    console.log("\nRelancer sans --dry-run pour exécuter réellement.");
    return;
  }

  let done = 0;
  let errors = 0;
  for (const id of ids) {
    try {
      await clearTagForUser(id);
      done++;
    } catch (e) {
      errors++;
      console.error(`Échec pour ${id}:`, e.message);
    }
    if ((done + errors) % 50 === 0) {
      console.log(`  ${done + errors}/${ids.length} traités (${errors} erreurs)`);
    }
    // Petite pause pour ne pas se faire rate-limiter
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nTerminé. ${done} comptes nettoyés, ${errors} erreurs.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
