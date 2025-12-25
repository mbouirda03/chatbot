// ================================
// CONFIG
// ================================

// URL de ta page web "Bibliothèque Réseau"
const RESEAU_LIBRARY_URL = "http://127.0.0.1:5500/reseau.html";

// Tes fichiers TXT publics dans S3
// ⚠️ Mets ici l’URL de TON fichier nettoyé
const TEXT_SOURCES = [
  {
    id: "RESEAU_CLEAN",
    filiere: "SRI",
    module: "reseau",
    url: "https://bts-chatbot-courses.s3.us-east-1.amazonaws.com/reseau+2anne.txt"
    // remplace par l’URL de ton nouveau .txt propre si tu en as un
  }
];

// cache en mémoire
let loadedTexts = null;


// ================================
// CHARGER LES TXT DEPUIS S3
// ================================
async function loadTextsOnce() {
  if (loadedTexts) return loadedTexts;

  loadedTexts = [];
  for (const src of TEXT_SOURCES) {
    try {
      const res = await fetch(src.url);
      const text = await res.text();
      loadedTexts.push({
        ...src,
        text
      });
    } catch (e) {
      console.error("Error loading:", src.url, e);
    }
  }
  return loadedTexts;
}


// ================================
// SCORE + MEILLEUR PARAGRAPHE
// ================================

// Score de similarité entre question et paragraphe
function scoreMatch(question, paragraph) {
  const important3 = ["stp", "vlan", "osi", "lan", "wan"];

  const qWords = question
    .toLowerCase()
    .replace(/[^a-z0-9éèàùîïôç ]/gi, " ")
    .split(/\s+/)
    .filter(w => {
      if (w.length > 3) return true;
      return important3.includes(w);
    });

  const pText = paragraph.toLowerCase();
  let score = 0;

  for (const w of qWords) {
    if (pText.includes(w)) score++;
  }
  return score;
}

// Cherche une "zone d’explication" avec plus de contexte
function bestParagraph(question, text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let bestIndex = -1;
  let bestScore = 0;

  // on cherche la meilleure ligne
  for (let i = 0; i < lines.length; i++) {
    const s = scoreMatch(question, lines[i]);
    if (s > bestScore) {
      bestScore = s;
      bestIndex = i;
    }
  }

  if (bestIndex === -1 || bestScore === 0) return null;

  // on construit un bloc autour de cette ligne
  const parts = [];

  // éventuellement la ligne juste avant (souvent un titre ou début de phrase)
  if (bestIndex > 0) {
    parts.push(lines[bestIndex - 1]);
  }

  parts.push(lines[bestIndex]);

  // puis on ajoute les lignes suivantes tant que :
  // - ce n’est pas une ligne vide
  // - on ne dépasse pas une certaine taille
  let currentLen = parts.join("\n").length;
  let i = bestIndex + 1;
  const MAX_LOCAL_LEN = 900; // longueur max pour ce bloc

  while (i < lines.length && currentLen < MAX_LOCAL_LEN) {
    const line = lines[i];

    // si on tombe sur une "séparation" très courte, on arrête
    if (line.length === 0) break;

    // si c’est un nouveau gros titre (par ex. commence par "I." ou "II.")
    if (/^[IVX]+\./.test(line) || /^Chapitre/i.test(line)) {
      break;
    }

    parts.push(line);
    currentLen += line.length + 1;
    i++;
  }

  return parts.join("\n");
}

// Fonction principale de réponse depuis les docs
async function answerFromDocs(question, filiere, module) {
  const texts = await loadTextsOnce();

  const subset = texts.filter(
    t => t.filiere === filiere && t.module === module
  );
  if (subset.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const doc of subset) {
    const para = bestParagraph(question, doc.text);
    if (!para) continue;
    const s = scoreMatch(question, para);
    if (s > bestScore) {
      bestScore = s;
      best = { docId: doc.id, paragraph: para };
    }
  }

  if (!best) return null;

  let para = best.paragraph.trim();
  const MAX_LEN = 1400; // un peu plus long qu’avant

  if (para.length > MAX_LEN) {
    para =
      para.slice(0, MAX_LEN) +
      "\n\n[...] (texte coupé, consulte le cours complet dans la bibliothèque)";
  }

  return `D'après le cours (${best.docId}) :\n\n${para}`;
}



// ================================
// DONNÉES POUR LES BOUTONS
// ================================
const data = {
  SRI: {
    reseau: {
      cours:
        `Voici la bibliothèque Réseau 👇<br><br>` +
        `<a href="${RESEAU_LIBRARY_URL}" target="_blank">📚 Ouvrir tous les cours Réseau</a>`,
      td:
        `Voici le TD Réseau (exemple).<br>` +
        `Tu peux aussi retrouver les TD dans la bibliothèque Réseau.`,
      tp:
        `Voici le TP Réseau (exemple).<br>` +
        `Tu peux aussi retrouver les TP dans la bibliothèque Réseau.`
    },
    linux: {
      cours: "Cours Linux SRI...",
      td: "TD Linux SRI...",
      tp: "TP Linux SRI..."
    },
    windows: {
      cours: "Cours Windows SRI...",
      td: "TD Windows SRI...",
      tp: "TP Windows SRI..."
    }
  },
  CG: {
    comptabilite: {
      cours: "Cours CG...",
      td: "TD CG...",
      tp: "TP CG..."
    }
  },
  ELT: {
    electrotechnique: {
      cours: "Cours ELT...",
      td: "TD ELT...",
      tp: "TP ELT..."
    }
  }
};

// Sessions en mémoire
const sessions = {};


// ================================
// HANDLER LAMBDA PRINCIPAL
// ================================
exports.handler = async (event) => {
  let body = {};

  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    console.log("JSON parse error:", err);
  }

  let msg = (body.message || "").toLowerCase();
  const sessionId = body.sessionId || "default";

  console.log("Incoming message:", msg, "session:", sessionId);

  if (!sessions[sessionId]) {
    sessions[sessionId] = { step: 1, field: null, module: null };
  }

  const s = sessions[sessionId];

  function reply(text, buttons = null) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: text, buttons })
    };
  }

  // STEP 1 : choisir filière
  if (s.step === 1 || msg === "start" || msg === "__start__") {
    s.step = 2;
    return reply("Choisissez votre filière :", [
      { label: "SRI", value: "sri", icon: "🖥️" },
      { label: "CG", value: "cg", icon: "📊" },
      { label: "ELT", value: "elt", icon: "⚡" }
    ]);
  }

  // STEP 2 : filière choisie
  if (s.step === 2) {
    msg = msg.toUpperCase();
    if (!data[msg]) {
      return reply("Filière inconnue. Choisissez SRI, CG ou ELT.");
    }

    s.field = msg;
    s.step = 3;

    function iconFor(module) {
      if (module === "reseau") return "🌐";
      if (module === "linux") return "🐧";
      if (module === "windows") return "🪟";
      return "📘";
    }

    const moduleButtons = Object.keys(data[s.field]).map((m) => ({
      label: m.charAt(0).toUpperCase() + m.slice(1),
      value: m,
      icon: iconFor(m)
    }));

    return reply("Choisissez un module :", moduleButtons);
  }

  // STEP 3 : module choisi
  if (s.step === 3) {
    if (!data[s.field][msg]) {
      return reply("Module invalide. Réessayez.");
    }

    s.module = msg;
    s.step = 4;

    return reply("Quel type de ressource voulez-vous ?", [
      { label: "Cours", value: "cours", icon: "📘" },
      { label: "TD", value: "td", icon: "📝" },
      { label: "TP", value: "tp", icon: "🧪" }
    ]);
  }

  // STEP 4 : cours / td / tp + questions libres
  if (s.step === 4) {
    // question libre
    if (msg !== "cours" && msg !== "td" && msg !== "tp") {
      const answer = await answerFromDocs(body.message || msg, s.field, s.module);
      if (answer) {
        return reply(answer, [
          { label: "Cours", value: "cours", icon: "📘" },
          { label: "TD", value: "td", icon: "📝" },
          { label: "TP", value: "tp", icon: "🧪" }
        ]);
      }
      return reply("Je n'ai pas trouvé la réponse exacte dans le cours.", [
        { label: "Cours", value: "cours", icon: "📘" },
        { label: "TD", value: "td", icon: "📝" },
        { label: "TP", value: "tp", icon: "🧪" }
      ]);
    }

    // boutons normaux
    const entry = data[s.field][s.module][msg];
    if (!entry) {
      return reply("Choisissez cours, td ou tp.");
    }

    s.step = 4;

    return reply(entry, [
      { label: "Cours", value: "cours", icon: "📘" },
      { label: "TD", value: "td", icon: "📝" },
      { label: "TP", value: "tp", icon: "🧪" }
    ]);
  }

  // fallback
  return reply("Je n'ai pas compris. Réessayez.");
};
