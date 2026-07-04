import { useState, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────
// The Odds API — clé gratuite sur https://the-odds-api.com
// 500 requêtes/mois en gratuit, largement suffisant pour commencer
// Matchs chargés via le backend Render (clé API sécurisée côté serveur)

// Sports couverts — Tennis + Football toutes compétitions majeures
const SPORT_KEYS = {
  tennis: [
    "tennis_atp_wimbledon","tennis_wta_wimbledon",
    "tennis_atp_french_open","tennis_wta_french_open",
    "tennis_atp_us_open","tennis_wta_us_open",
    "tennis_atp_australian_open","tennis_wta_australian_open",
  ],
  football: [
    "soccer_fifa_world_cup",           // 🌍 Coupe du Monde FIFA
    "soccer_uefa_champs_league",       // Champions League
    "soccer_uefa_europa_league",       // Europa League
    "soccer_france_ligue_one",         // Ligue 1
    "soccer_spain_la_liga",            // La Liga
    "soccer_epl",                      // Premier League
    "soccer_germany_bundesliga",       // Bundesliga
    "soccer_italy_serie_a",            // Serie A
    "soccer_portugal_primeira_liga",   // Liga Portugal
    "soccer_netherlands_eredivisie",   // Eredivisie
    "soccer_belgium_first_div",        // Pro League Belgique
    "soccer_france_ligue_two",         // Ligue 2
  ]
};

const BOOKMAKERS = ["winamax","betclic","unibet","pinnacle","bet365"];

// ─── ABONNEMENT (Stripe) ──────────────────────────────────────────
const TRIAL_DAYS = 4;
const PRICE_MONTHLY = 24.90; // €
const PRICE_ANNUAL = 249; // €

// Clé PUBLIQUE Stripe — sans danger à exposer côté client (commence par pk_)
const STRIPE_PUBLIC_KEY = "pk_live_51Tnr6CAxeR2E4XmUAShz2QN3oHE8LImM742iMHE3Xd9gHRlFlYgs6C0NLRQumgn5v4DQKLA9Kz0rgUGRERDfv71100C05sITTa";

// ⚠️ La clé SECRÈTE Stripe (sk_...) ne doit JAMAIS être mise ici.
// Elle doit vivre uniquement sur un serveur backend, qui créera la session
// de paiement et l'abonnement récurrent via l'API Stripe (Checkout + Billing).
// Une fois ton backend déployé, mets son URL ci-dessous :
const BACKEND_URL = "https://bettrust-backend.onrender.com"; // Backend Render

const STRIPE_CHECKOUT_ENDPOINT = "https://bettrust-backend.onrender.com/api/create-checkout-session";

async function createStripeCheckout(user, amount = PRICE_MONTHLY, interval = "month") {
  if (STRIPE_CHECKOUT_ENDPOINT === "REMPLACE_PAR_TON_ENDPOINT_BACKEND") {
    return { ok: false, demo: true };
  }
  try {
    const res = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, priceAmount: amount, currency: "eur", interval, trialDays: TRIAL_DAYS })
    });
    const data = await res.json();
    return data;
  } catch(e) { return { ok: false, error: true }; }
}

// ─── STORAGE ──────────────────────────────────────────────────────
// ─── GÉNÉRATEUR DE NOM DE COACH UNIQUE ───────────────────────────
// Chaque utilisateur reçoit un coach attitré à vie dès la création du compte.
// Format : Prénom.InitialeNom  ex: Fabrice.K / Lionel.M / Sofia.R
const COACH_FIRSTNAMES = [
  "Fabrice","Lionel","Marco","Sofia","Thierry","Yann","Leila","Bruno",
  "Karim","Nadia","Stéphane","Amara","Julien","Cécile","Omar","Lucie",
  "Romain","Aïcha","Vincent","Inès","Patrick","Myriam","Sébastien","Dina",
  "Antoine","Fatou","Nicolas","Jade","Samuel","Yasmine","Axel","Camille",
  "Mehdi","Chloé","Alexis","Soraya","Damien","Noémie","Tristan","Lina"
];
const COACH_INITIALS = "ABCDEFGHJKLMNOPRSTWY";

function generateCoachName(email) {
  // Seed déterministe basé sur l'email — même résultat à chaque appel
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);
  const firstName = COACH_FIRSTNAMES[abs % COACH_FIRSTNAMES.length];
  const initial = COACH_INITIALS[(abs >> 3) % COACH_INITIALS.length];
  return `${firstName}.${initial}`;
}

// ─── SUPABASE ─────────────────────────────────────────────────────
const SUPABASE_URL = "https://wcpsxgoposjouwyotbjn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjcHN4Z29wb3Nqb3V3eW90YmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTE2NzAsImV4cCI6MjA5ODY4NzY3MH0.MVMKaRrXRJS9cwZ7uB27D8SeWkkcbvk6XFKn0yWGeDw";

// Client Supabase léger sans SDK (appels REST directs)
const sb = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  },

  // Auth
  async signUp(email, password, meta) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ email, password, data: meta }),
    });
    return r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { ...this.headers, "Authorization": `Bearer ${token}` },
    });
  },

  // Database
  async upsert(table, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...this.headers,
        "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(data),
    });
    return r.ok;
  },
  async select(table, filter, token) {
    const query = filter ? `?${filter}` : "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      headers: {
        ...this.headers,
        "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
      },
    });
    return r.ok ? r.json() : [];
  },
  async update(table, filter, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: {
        ...this.headers,
        "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(data),
    });
    return r.ok ? r.json() : null;
  },
  async delete(table, filter, token) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: {
        ...this.headers,
        "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
      },
    });
  },
};

// ─── FONCTIONS STOCKAGE (Supabase) ────────────────────────────────
async function saveUser(user) {
  try {
    await sb.upsert("profiles", {
      id: user.id, email: user.email, name: user.name,
      coach_name: user.coachName || generateCoachName(user.email),
      created_at: user.createdAt || new Date().toISOString(),
    }, user.token);
  } catch(e) {}
}
async function getUser(email) {
  try {
    const rows = await sb.select("profiles", `email=eq.${email}&limit=1`);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return { email: r.email, name: r.name, coachName: r.coach_name, id: r.id };
  } catch(e) { return null; }
}
async function saveBet(email, bet, token) {
  try {
    await sb.upsert("bets", { ...bet, user_email: email }, token);
  } catch(e) {}
}
async function getBets(email, token) {
  try {
    const rows = await sb.select("bets", `user_email=eq.${encodeURIComponent(email)}&order=created_at.desc`, token);
    return rows || [];
  } catch(e) { return []; }
}
async function updateBet(email, betId, updates, token) {
  try {
    await sb.update("bets", `id=eq.${betId}&user_email=eq.${encodeURIComponent(email)}`, updates, token);
    return getBets(email, token);
  } catch(e) { return []; }
}
// ─── GESTION ABONNEMENT SUPABASE ─────────────────────────────────
async function saveSubscription(email, sub, token) {
  try {
    const tok = token || SUPABASE_ANON_KEY;
    // Utilise UPSERT (DELETE + INSERT) pour garantir la mise à jour
    const body = {
      user_email: email,
      status: sub.status,
      trial_started_at: sub.trial_started_at || sub.trialStartedAt || null,
      trial_ends_at: sub.trial_ends_at || sub.trialEndsAt || null,
      paid_at: sub.paid_at || sub.paidAt || null,
      plan: sub.plan || null,
      updated_at: new Date().toISOString(),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${tok}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch(e) { return false; }
}

async function getSubscription(email, token) {
  try {
    const tok = token || SUPABASE_ANON_KEY;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_email=eq.${encodeURIComponent(email)}&limit=1`,
      {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${tok}`,
        },
      }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    // Normalise snake_case → camelCase pour compatibilité
    return {
      ...row,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      paidAt: row.paid_at,
    };
  } catch(e) { return null; }
}

// Anti-abus : vérifie si un email a déjà utilisé un essai gratuit
async function hasUsedTrial(email) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_email=eq.${encodeURIComponent(email)}&select=trial_started_at&limit=1`,
      { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return rows && rows.length > 0 && rows[0].trial_started_at !== null;
  } catch(e) { return false; }
}


async function saveLastSeen(email, token) {
  try {
    await sb.upsert("profiles", { email, last_seen: new Date().toISOString() }, token);
  } catch(e) {}
}
async function getLastSeen(email, token) {
  try {
    const rows = await sb.select("profiles", `email=eq.${email}&select=last_seen&limit=1`, token);
    return rows && rows.length > 0 ? rows[0].last_seen : null;
  } catch(e) { return null; }
}
async function saveConsent(email, token) {
  try {
    await sb.upsert("profiles", { email, consent_at: new Date().toISOString() }, token);
  } catch(e) {}
}
async function getConsent(email, token) {
  try {
    const rows = await sb.select("profiles", `email=eq.${email}&select=consent_at&limit=1`, token);
    return rows && rows.length > 0 ? rows[0].consent_at : null;
  } catch(e) { return null; }
}
async function saveRatingGiven(email, token) {
  try {
    await sb.upsert("profiles", { email, rating_given_at: new Date().toISOString() }, token);
  } catch(e) {}
}
async function getRatingGiven(email, token) {
  try {
    const rows = await sb.select("profiles", `email=eq.${email}&select=rating_given_at&limit=1`, token);
    return rows && rows.length > 0 ? rows[0].rating_given_at : null;
  } catch(e) { return null; }
}
async function saveRatingDismissed(email, token) {
  try {
    await sb.upsert("profiles", { email, rating_dismissed: true }, token);
  } catch(e) {}
}
async function getRatingDismissed(email, token) {
  try {
    const rows = await sb.select("profiles", `email=eq.${email}&select=rating_dismissed&limit=1`, token);
    return rows && rows.length > 0 ? rows[0].rating_dismissed : null;
  } catch(e) { return null; }
}
async function saveAppRating(email, rating, comment, token) {
  try {
    await sb.upsert("profiles", { email, app_rating: rating, app_rating_comment: comment }, token);
  } catch(e) {}
}


// ─── ODDS API ─────────────────────────────────────────────────────
async function fetchAllMatches(sport) {
  try {
    // Passe par le backend Render qui a la vraie clé API
    const res = await fetch(`${BACKEND_URL}/api/odds/${sport}`);
    if (!res.ok) throw new Error("Backend error");
    const data = await res.json();
    return data.matches || [];
  } catch(e) {
    // Fallback démo si le backend est indisponible
    console.warn("Backend indisponible, mode démo");
    return [];
  }
}

async function fetchOddsForSport(sportKey) {
  // Gardé pour compatibilité mais non utilisé directement
  const res = await fetch(`${BACKEND_URL}/api/odds/${sportKey.includes("tennis") ? "tennis" : "football"}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.matches || [];
}

function parseOddsMatch(raw, sport) {
  // Trouve le meilleur bookmaker dispo
  const bm = raw.bookmakers?.find(b => BOOKMAKERS.includes(b.key)) || raw.bookmakers?.[0];
  if (!bm) return null;
  const h2h = bm.markets?.find(m => m.key === "h2h");
  if (!h2h?.outcomes?.length) return null;

  const outcomes = h2h.outcomes;
  const home = outcomes.find(o => o.name === raw.home_team);
  const away = outcomes.find(o => o.name === raw.away_team);
  const draw = outcomes.find(o => o.name === "Draw");

  if (!home || !away) return null;

  const matchTime = new Date(raw.commence_time);
  const timeStr = matchTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = matchTime.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return {
    id: raw.id,
    p1: raw.home_team,
    p2: raw.away_team,
    tournament: raw.sport_title || raw.sport_key,
    time: timeStr,
    date: dateStr,
    fullDate: raw.commence_time,
    c1: parseFloat(home.price.toFixed(2)),
    c2: parseFloat(away.price.toFixed(2)),
    cN: draw ? parseFloat(draw.price.toFixed(2)) : null,
    bookmaker: bm.title,
    sport,
    f1: sport === "tennis" ? "🎾" : "⚽",
    f2: sport === "tennis" ? "🎾" : "⚽",
  };
}

// ─── DÉTECTEUR DE PIÈGES & VALUE BETS ─────────────────────────────
// Convertit une cote décimale en probabilité implicite du marché (%)
function impliedProbability(cote) {
  return (1 / cote) * 100;
}

// Estime une probabilité "réelle" à partir de l'analyse IA.
// En attendant un vrai modèle statistique, on utilise la confiance
// donnée par l'IA (0-10) pour calibrer un écart plausible et réaliste
// par rapport à la probabilité du marché — jamais un écart absurde.
function estimateAIProbability(marketProb, aiConfidence) {
  // aiConfidence : 0-10. 5 = l'IA est neutre (d'accord avec le marché).
  // >5 = l'IA pense que c'est sous-évalué (value). <5 = sur-évalué (piège).
  const delta = (aiConfidence - 5) * 4; // max ±20 points d'écart
  let estimated = marketProb + delta;
  estimated = Math.max(5, Math.min(95, estimated)); // bornes réalistes
  return estimated;
}

function getEdgeSignal(cote, aiConfidence) {
  const marketProb = impliedProbability(cote);
  const aiProb = estimateAIProbability(marketProb, aiConfidence);
  const edge = aiProb - marketProb; // positif = value, négatif = piège

  if (edge >= 8) return { type: "value", label: "Bon plan", icon: "💎", marketProb, aiProb, edge, color: "#0ea5e9", bg:"#eff6ff", border:"#93c5fd" };
  if (edge <= -8) return { type: "trap", label: "Piège", icon: "🪤", marketProb, aiProb, edge, color: "#dc2626", bg:"#fef2f2", border:"#fca5a5" };
  return { type: "neutral", label: "Cote juste", icon: "⚖️", marketProb, aiProb, edge, color: "#6b7280", bg:"#f9fafb", border:"#e5e7eb" };
}

// Confiance simulée par défaut (avant analyse IA réelle) — basée sur l'écart
// de cotes entre favori et outsider, pour donner un signal même sans avoir
// encore lancé l'analyse complète.
function defaultConfidenceFromOdds(cote, opponentCote) {
  const ratio = opponentCote / cote;
  // plus le ratio est élevé, plus on est "confiant" par défaut (signal neutre-ish)
  const conf = Math.min(8, Math.max(2, 5 + (ratio - 1.5)));
  return conf;
}


const DEMO_MATCHES = {
  tennis: [
    { id:"t1", p1:"C. Alcaraz", p2:"J. Sinner", tournament:"Wimbledon 2026", time:"14:00", date:"lun. 29 juin", c1:1.85, c2:2.10, cN:null, bookmaker:"Winamax", sport:"tennis", f1:"🎾", f2:"🎾" },
    { id:"t2", p1:"N. Djokovic", p2:"H. Hurkacz", tournament:"Wimbledon 2026", time:"16:30", date:"lun. 29 juin", c1:1.55, c2:2.70, cN:null, bookmaker:"Betclic", sport:"tennis", f1:"🎾", f2:"🎾" },
    { id:"t3", p1:"I. Swiatek", p2:"A. Sabalenka", tournament:"Wimbledon 2026", time:"12:00", date:"lun. 29 juin", c1:2.10, c2:1.75, cN:null, bookmaker:"Unibet", sport:"tennis", f1:"🎾", f2:"🎾" },
    { id:"t4", p1:"T. Fritz", p2:"A. Zverev", tournament:"Wimbledon 2026", time:"18:00", date:"lun. 29 juin", c1:2.40, c2:1.60, cN:null, bookmaker:"Winamax", sport:"tennis", f1:"🎾", f2:"🎾" },
  ],
  football: [
    { id:"f1", p1:"PSG", p2:"Lyon", tournament:"Ligue 1", time:"21:00", date:"lun. 29 juin", c1:1.65, cN:3.80, c2:4.50, bookmaker:"Winamax", sport:"football", f1:"⚽", f2:"⚽" },
    { id:"f2", p1:"Real Madrid", p2:"Barcelona", tournament:"La Liga", time:"20:00", date:"lun. 29 juin", c1:2.10, cN:3.40, c2:3.20, bookmaker:"Betclic", sport:"football", f1:"⚽", f2:"⚽" },
    { id:"f3", p1:"Man City", p2:"Arsenal", tournament:"Premier League", time:"17:30", date:"lun. 29 juin", c1:1.90, cN:3.60, c2:3.80, bookmaker:"Unibet", sport:"football", f1:"⚽", f2:"⚽" },
    { id:"f4", p1:"Bayern", p2:"Dortmund", tournament:"Bundesliga", time:"18:30", date:"lun. 29 juin", c1:1.70, cN:3.90, c2:4.20, bookmaker:"Winamax", sport:"football", f1:"⚽", f2:"⚽" },
  ]
};

// ─── AI ANALYSIS ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'analyste IA de BetTrust. Tu penses comme un bookmaker et un trader sportif.

MÉTHODE (sois RAPIDE et PRÉCIS) :
1. Convertis les cotes en probabilités implicites
2. Cherche la forme récente, état physique, météo, contexte
3. Identifie si le marché sur-cote ou sous-cote

FORMAT OBLIGATOIRE — respecte exactement ces balises :

⚡ VERDICT : [qui va gagner et pourquoi en 1 phrase]
🎯 CONFIANCE : X/10
🔍 SIGNAL MARCHÉ : [💎 Value bet / 🪤 Piège / ⚖️ Cote juste] — Prob. marché XX% vs Prob. réelle estimée XX%

📊 ANALYSE INSIDER :
[3-4 points clés : forme, physique, contexte, météo — sois concis]

🎯 TOUS LES PARIS RECOMMANDÉS :
→ [Marché] : [Sélection] @ [Cote] — Confiance X/10 — [Raison courte]
→ [Marché] : [Sélection] @ [Cote] — Confiance X/10 — [Raison courte]
→ [Marché] : [Sélection] @ [Cote] — Confiance X/10 — [Raison courte]

🏆 LE MEILLEUR PARI DU MATCH :
[Sélection exacte] @ [Cote exacte] — Confiance [X]/10
Marché : [nom exact du marché]
Pourquoi : [1 phrase claire et directe]

⚠️ RISQUE : [une seule chose qui pourrait tout changer]
---`;

const FOOTBALL_SYSTEM_PROMPT = `Tu es l'analyste football IA de BetTrust. Tu penses comme un bookmaker et un trader sportif.

MÉTHODE (sois RAPIDE et PRÉCIS) :
1. Convertis les cotes en probabilités implicites
2. Cherche compositions probables, forme des 5 derniers matchs, xG
3. Analyse : buts probables, buteurs, tirs, corners, mi-temps

FORMAT OBLIGATOIRE — respecte exactement ces balises :

⚡ VERDICT : [résultat probable en 1 phrase directe]
🎯 CONFIANCE : X/10
🔍 SIGNAL MARCHÉ : [💎 Value bet / 🪤 Piège / ⚖️ Cote juste] — Prob. marché XX% vs Prob. réelle XX%

📊 ANALYSE INSIDER :
[Composition probable, forme récente, xG moyens, facteurs clés — sois concis]

🎯 TOUS LES PARIS RECOMMANDÉS :
→ [Marché exact] : [Sélection] @ [Cote] — Confiance X/10 — [Raison]
→ [Marché exact] : [Sélection] @ [Cote] — Confiance X/10 — [Raison]
→ [Marché exact] : [Sélection] @ [Cote] — Confiance X/10 — [Raison]
→ [Buteur probable] : [Nom] @ [Cote] — Confiance X/10 — [Raison]

🏆 LE MEILLEUR PARI DU MATCH :
[Sélection exacte] @ [Cote exacte] — Confiance [X]/10
Marché : [nom exact : Over 2.5 buts / Victoire X / Buteur Y...]
Pourquoi : [1 phrase claire et directe]

⚠️ RISQUE : [une seule chose qui pourrait tout changer]
---`;

async function analyzeMatch(match) {
  const isFootball = match.sport === "football";
  const systemPrompt = isFootball ? FOOTBALL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userContent = isFootball
    ? `Analyse comme un insider de haut niveau : ${match.p1} vs ${match.p2} (${match.tournament}, ${match.date} à ${match.time}). Cotes actuelles: ${match.p1}@${match.c1}${match.cN?` | Nul@${match.cN}`:""} | ${match.p2}@${match.c2}. Source: ${match.bookmaker}. Déconstruis les cotes, cherche les compositions, croise toutes les données disponibles. Je veux l'analyse que les bookmakers font eux-mêmes en interne — pas ce qu'ils montrent au public.`
    : `Analyse comme un insider : ${match.p1} vs ${match.p2} (${match.tournament}, ${match.date} à ${match.time}). Cotes: ${match.p1}@${match.c1}${match.cN?` | Nul@${match.cN}`:""} | ${match.p2}@${match.c2}. Déconstruis les cotes, cherche tous les signaux physiques, mentaux, météo, contextuels. Trouve ce que le marché n a pas encore pricé.`;

  // Réessaie jusqu'à 2 fois si le serveur est endormi
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min max
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [{ role: "user", content: userContent }],
          system: systemPrompt,
          max_tokens: isFootball ? 1200 : 900,
          useWebSearch: true,
        })
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.text || "Analyse indisponible.";
    } catch(e) {
      if (attempt === 0) {
        // Première tentative échouée — attend 3s que le serveur se réveille
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw new Error("Le serveur met du temps à répondre. Réessaie dans quelques secondes.");
    }
  }
}

const DEBRIEF_PROMPT = `Tu es le coach analytique de BetTrust. Ton rôle : disséquer un pari après le match avec la précision d'un chirurgien.

PHILOSOPHIE :
Un pari n est jamais "bon" ou "mauvais" à cause du résultat. Un pari est bon si le processus de décision était fondé sur une vraie valeur identifiée avant le match. Un pari est mauvais si c était de la chance déguisée en analyse.

Ton debrief doit répondre à ces 4 questions :
1. Est-ce que l'avantage informationnel existait vraiment au moment du pari ?
2. Le marché a-t-il bougé APRÈS le pari (ce qui confirmerait ou infirmerait la lecture) ?
3. Qu'est-ce qui s'est réellement passé — et était-ce prévisible ?
4. Quelle est la leçon systémique, pas émotionnelle ?

FORMAT STRICT :
---
🔁 CE QUI S'EST PASSÉ : [résumé factuel du match — score, déroulé clé, moment décisif]
📊 LE MARCHÉ AVAIT-IL TORT ? : [le mouvement de cote confirme-t-il ou infirme-t-il l'analyse initiale ?]
✅ QUALITÉ DE LA DÉCISION : [Excellente / Bonne / Discutable / Mauvaise] — justifié par les données, pas le résultat
🎲 PART D'IMPRÉVISIBLE : [Nulle / Faible / Moyenne / Élevée] — qu'est-ce qui était vraiment inévitable ?
📚 LEÇON SYSTÉMIQUE : [pas "j'aurais dû", mais "dans ce type de configuration, voilà ce qu'on fait différemment"]
---`;

async function debriefMatch(bet) {
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Pari analysé : ${bet.pick} dans ${bet.match} (${bet.tournament}, ${bet.date}), cote ${bet.cote}, mise ${bet.mise}€ sur ${bet.bookmaker}. Résultat : ${bet.status === "won" ? "GAGNÉ" : "PERDU"}. Cherche ce qui s est réellement passé dans ce match, analyse si l'avantage informationnel existait vraiment, et donne le debrief le plus honnête et constructif possible.` }],
      system: DEBRIEF_PROMPT,
      max_tokens: 1000,
      useWebSearch: true,
    })
  });
  const data = await res.json();
  return data.text || "Debrief indisponible.";
}

const COACH_PROMPT = `Tu es le coach analytique personnel de BetTrust. Tu as accès à l'historique complet d'un parieur et tu vas lui faire une analyse clinique de son profil — sans complaisance, sans consolation inutile, avec la précision d'un professionnel.

PHILOSOPHIE :
Les parieurs perdent pour des raisons systémiques identifiables. Ton rôle est de les identifier toutes, de les quantifier, et de proposer une stratégie correctrice précise.

ANALYSE EN 6 DIMENSIONS :
1. BIAIS COGNITIFS : récence, représentativité, gambler's fallacy, overconfidence
2. PATTERNS DE PERTE : sur quel type de pari perd-il le plus en valeur absolue ?
3. ANALYSE DE LA SÉLECTION : surperforme-t-il ou sous-performe-t-il ses probabilités implicites ?
4. GESTION DU BANKROLL : Kelly optimal estimé vs mises réelles, variabilité des mises
5. POINTS FORTS RÉELS : ses 3 meilleures configurations de pari
6. PLAN D'ACTION : 3 règles précises, 1 type de pari à arrêter, 1 type à augmenter

FORMAT STRICT :
---
👤 PROFIL : [une phrase qui capture son style de parieur avec précision]
📊 STATS CLÉS : [les chiffres qui racontent vraiment son histoire]

💪 SES VRAIS POINTS FORTS :
[Données à l'appui — pas de compliments vides]

⚠️ SES BIAIS IDENTIFIÉS :
[Nommés, quantifiés, exemples tirés de son historique]

🎯 PLAN D'ACTION — 3 RÈGLES IMMÉDIATES :
1. [Règle précise + pourquoi + comment mesurer]
2. [Règle précise + pourquoi + comment mesurer]
3. [Règle précise + pourquoi + comment mesurer]

🔮 PROJECTION : Si tu appliques ces 3 règles sur les 30 prochains paris : [projection honnête]
---`;

async function analyzeCoach(bets, userName, coachName = "Alex.B") {
  const stats = computeCoachStats(bets);
  const betsSummary = bets.slice(0,30).map(b =>
    `[${b.status==="won"?"✅":"❌"}] ${b.match} — ${b.pick} @${b.cote} — ${b.mise}€ — ${b.sport} — ${b.bookmaker} — ${b.date||"N/A"}`
  ).join("\n");

  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Coach : ${coachName} — Parieur : ${userName}\nStats : ${stats.total} paris | ${stats.roi}% ROI | ${stats.topSport} dominant | cote moy ${stats.avgCote}\n\n${betsSummary}\n\nFais l analyse la plus précise et honnête. Parle directement à ${userName}. Signe avec ton nom.` }],
      system: COACH_PROMPT,
      max_tokens: 1400,
      useWebSearch: false,
    })
  });
  const data = await res.json();
  return data.text || "Analyse indisponible.";
}

const HALFTIME_PROMPT = `Tu es l'analyste mi-temps de BetTrust — spécialiste des paris en cours de match (live betting).

CONTEXTE : Les cotes de 2ème mi-temps reflètent ce que le grand public a vu. Toi, tu vas analyser CE QUE LE PUBLIC N'A PAS VU.

ANALYSE REQUISE :
- Distance parcourue par équipe — indicateur de pressing et d'intensité
- Sprints à haute intensité — qui sera fatigué en fin de match
- Tirs tentés / cadrés / xG générés — qui crée vraiment
- Ajustements tactiques visibles — quel coach a réajusté ?
- Joueurs ayant subi des chocs physiques — risque de sortie
- Impact probable des remplaçants disponibles
- Historique de ce type d'équipe en 2ème mi-temps (certaines explosent, d'autres s'effondrent)

SIGNAL LIVE : Tu ne recommandes un pari que si la valeur est CLAIREMENT identifiable — la cote offerte n'intègre pas encore ce que tu as trouvé.

FORMAT STRICT :
---
📊 STATS 1ÈRE MI-TEMPS : [données factuelles — tirs, xG, possession, incidents physiques]
🔬 LECTURE CACHÉE : [ce que le grand public a raté dans cette mi-temps]
⚡ JOUEURS DÉTERMINANTS EN 2ÈME MI-TEMPS : [qui va changer le match et pourquoi]
🩹 RISQUES PHYSIQUES : [joueurs à risque de blessure ou de baisse de régime]

🔔 SIGNAL LIVE : [ALERTE PARI — valeur identifiée / Aucun signal — marché bien pricé]
💰 PARI RECOMMANDÉ : [si signal : pari exact + cote + raisonnement en 2 phrases]
---`;

async function analyzeHalftime(match, halftimeScore) {
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Match en cours : ${match.p1} vs ${match.p2} (${match.tournament}, ${match.date}). Score mi-temps : ${halftimeScore}. Cherche les stats de 1ère mi-temps. Analyse comme un trader sportif — qu'est-ce que le marché n a pas encore pricé dans les cotes de 2ème mi-temps ? Y a-t-il une vraie valeur identifiable ?` }],
      system: HALFTIME_PROMPT,
      max_tokens: 1400,
      useWebSearch: true,
    })
  });
  const data = await res.json();
  return data.text || "Analyse mi-temps indisponible.";
}

const LINEUP_PROMPT = `Tu es le scout et analyste données de BetTrust — tu produis les fiches joueurs les plus complètes disponibles pour un parieur.

PHILOSOPHIE : Un pari sur un buteur n est pas de la chance. C est une décision basée sur des probabilités réelles, calculées à partir de données spécifiques.

POUR CHAQUE JOUEUR DE CHAMP :
1. DONNÉES BRUTES : Titularisations / Minutes jouées sur 5 derniers matchs
2. PRODUCTION : G/A sur 5 matchs + xG + xA si disponibles
3. FORME RÉELLE : Au-dessus ou en-dessous de ses xG ? (chanceux ou efficient ?)
4. PHYSIQUE : Fatigue cumulée (minutes sur 7 jours), blessures récentes, chocs lors du dernier match
5. MENTAL : Posts récents Instagram/X, déclarations, rumeurs fiables, vie personnelle impactante
6. CONTEXTE ADVERSE : La défense adverse est-elle vulnérable sur ses zones de force ?

CALCUL DES PROBABILITÉS :
- But% = f(xG moyen sur 5 matchs, efficacité de finition, qualité défense adverse, contexte match)
- Passe% = f(xA moyen, créativité récente, pressing subi, style de l'attaque adverse)

SEUILS :
- But% ou Passe% > 60% : 🟡 SIGNAL MODÉRÉ
- But% ou Passe% > 75% : 🚨 QUASI-CERTITUDE — pari prioritaire

FORMAT STRICT :
---
👥 COMPOSITION [ÉQUIPE 1] (probable/officielle) :
[Pour chaque joueur de champ :]
🔵 [Prénom Nom] — [Poste]
  Données : X/5 tit. | X min. | G/A : X/X | xG : X.X
  Forme : [au-dessus/en-dessous de ses xG]
  Physique : [état musculaire, fatigue]
  Perso : [signal récent ou RAS]
  🎯 But : XX% | 🎯 Passe : XX%
  [Si >75% : 🚨 QUASI-CERTITUDE — [marché exact + cote estimée]]

👥 COMPOSITION [ÉQUIPE 2] (même format)

🏆 TOP SIGNAUX DU MATCH :
[Joueur — But%/Passe% — Marché recommandé — Justification]
---`;

const LINEUP_JSON_PROMPT = `Retourne UNIQUEMENT un JSON valide pour ce match de football. Structure exacte :

{"team1":{"name":"Nom","formation":"4-3-3","color":"#003399","players":[{"name":"Prénom Nom","position":"GK","number":1,"row":0,"col":0,"stats":"5J: 5 tit | G/A: 0/0","form":"Bon","physical":"Fit","perso":"RAS","butPct":0,"passePct":2,"alert":false}]},"team2":{"name":"Nom","formation":"4-4-2","color":"#cc0000","players":[]}}

RÈGLES :
- row: 0=GK, 1=DEF, 2=MIL DEF, 3=MIL, 4=MIL OFF, 5=ATT
- col: position horizontale 0=gauche
- 11 joueurs par équipe
- Cherche compositions officielles ou probables sur internet
- UNIQUEMENT LE JSON, RIEN D'AUTRE`;

async function analyzeLineup(match) {
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Match : ${match.p1} vs ${match.p2} (${match.tournament}, ${match.date} à ${match.time}). Cherche les compositions officielles ou probables sur internet. Retourne UNIQUEMENT le JSON demandé avec les 11 titulaires de chaque équipe, leur formation tactique exacte, et leurs stats sur les 5 derniers matchs.` }],
      system: LINEUP_JSON_PROMPT,
      max_tokens: 3000,
      useWebSearch: true,
    })
  });
  const data = await res.json();
  // Parse le JSON retourné
  try {
    const text = data.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch(e) {}
  return null;
}

// Calcule les positions (x, y) des joueurs sur le terrain selon la formation
function getPlayerPositions(players, teamSide) {
  // Groupe par row
  const rows = {};
  players.forEach(p => {
    if (!rows[p.row]) rows[p.row] = [];
    rows[p.row].push(p);
  });

  const positions = {};
  const FIELD_W = 100; const FIELD_H = 100;

  Object.entries(rows).forEach(([row, ps]) => {
    const r = parseInt(row);
    const n = ps.length;
    const yBase = teamSide === "top"
      ? [8, 22, 35, 48, 60][r] || 15 + r * 15
      : [92, 78, 65, 52, 40][r] || 85 - r * 15;

    ps.forEach((p, i) => {
      const x = n === 1 ? 50 : 10 + (i / (n - 1)) * 80;
      positions[p.name] = { x, y: yBase };
    });
  });
  return positions;
}



// ─── STYLES ───────────────────────────────────────────────────────

const C = { green:"#16a34a", lightGreen:"#f0fdf4", borderGreen:"#86efac", gray:"#6b7280", border:"#e5e7eb", bg:"#f8fafb" };

// ─── ANIMATIONS GLOBALES ───────────────────────────────────────────
function GlobalAnimations() {
  return (
    <style>{`
      /* Entrées */
      @keyframes fadeUp    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeDown  { from{opacity:0;transform:translateY(-14px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
      @keyframes scaleIn   { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
      @keyframes slideLeft { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
      @keyframes slideUp   { from{transform:translateY(100%)} to{transform:translateY(0)} }

      /* Looping */
      @keyframes pulse     { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.75;transform:scale(1.06)} }
      @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      @keyframes shimmer   { from{background-position:-200% center} to{background-position:200% center} }
      @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes bounceIn  { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
      @keyframes ripple    { 0%{transform:scale(0);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }

      /* Classes utilitaires */
      .anim-fadeup   { animation: fadeUp   0.4s cubic-bezier(.34,1.2,.64,1) both; }
      .anim-fadein   { animation: fadeIn   0.35s ease both; }
      .anim-scalein  { animation: scaleIn  0.35s cubic-bezier(.34,1.3,.64,1) both; }
      .anim-float    { animation: float    3s ease-in-out infinite; }
      .anim-pulse    { animation: pulse    2s ease-in-out infinite; }
      .anim-bounce   { animation: bounceIn 0.5s cubic-bezier(.34,1.56,.64,1) both; }

      /* Hover interactif sur boutons */
      .btn-hover { transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease; }
      .btn-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
      .btn-hover:active { transform: translateY(0) scale(0.97); }

      /* Hover sur cartes de match */
      .card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .card-hover:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,0,0,0.14); }

      /* Tabs avec slide indicator */
      .tab-active { position: relative; }
      .tab-active::after {
        content: '';
        position: absolute;
        bottom: -2px; left: 0; right: 0;
        height: 2.5px;
        background: #16a34a;
        border-radius: 99px;
        animation: fadeIn 0.2s ease;
      }

      /* Skeleton loading shimmer */
      .skeleton {
        background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
        background-size: 200% auto;
        animation: shimmer 1.4s linear infinite;
        border-radius: 8px;
      }

      /* Notification badge pulse */
      .badge-pulse { animation: pulse 1.8s ease-in-out infinite; }

      /* Panel slide-up depuis le bas */
      .panel-slidein { animation: slideUp 0.38s cubic-bezier(.32,1.2,.64,1) both; }

      /* Stagger delays */
      .delay-1 { animation-delay: 0.07s; }
      .delay-2 { animation-delay: 0.14s; }
      .delay-3 { animation-delay: 0.21s; }
      .delay-4 { animation-delay: 0.28s; }
      .delay-5 { animation-delay: 0.35s; }

      /* Smooth scroll */
      * { scroll-behavior: smooth; }

      /* Transitions globales */
      button { transition: opacity 0.15s ease, transform 0.15s ease; }
      button:active { opacity: 0.85; transform: scale(0.97); }
      input, textarea { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      input:focus, textarea:focus { box-shadow: 0 0 0 3px rgba(22,163,74,0.15); }
    `}</style>
  );
}


// ─── THÈMES PAR SPORT ──────────────────────────────────────────────
// Football : pelouse stylisée, vert profond / blanc craie
// Tennis : terre battue, ocre/terracotta / blanc craie
const THEMES = {
  tennis: {
    bg: "#C96A4A",          // ocre terre battue
    bgDark: "#A8512F",      // ligne de fond plus sombre pour le dégradé
    surface: "#FFF8F2",     // cartes : blanc cassé chaud
    surfaceAlt: "#FBE9DF",  // zones secondaires
    ink: "#3D1F12",         // texte principal sur fond clair
    accent: "#C96A4A",      // accent principal (boutons primaires)
    accentDark: "#A8512F",
    line: "#F0D8C8",        // bordures douces
    chalk: "rgba(255,255,255,0.55)", // lignes de court
  },
  football: {
    bg: "#1B6B3A",          // vert pelouse profond
    bgDark: "#145229",
    surface: "#FFFFFF",
    surfaceAlt: "#EAF7EF",
    ink: "#0F2E1C",
    accent: "#1B6B3A",
    accentDark: "#145229",
    line: "#D7EFE0",
    chalk: "rgba(255,255,255,0.5)",
  },
};

// Fond SVG terrain de foot, vue de dessus stylisée façon croquis tactique
function FootballFieldBackground() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 860" preserveAspectRatio="xMidYMin slice"
      style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}>
      <defs>
        {/* Dégradé principal pelouse — perspective du haut vers le bas */}
        <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0e3d1f" />
          <stop offset="30%"  stopColor="#155c2e" />
          <stop offset="60%"  stopColor="#1a6e35" />
          <stop offset="100%" stopColor="#0f4220" />
        </linearGradient>
        {/* Bandes de tonte alternées — effet mowing stripes 3D */}
        <linearGradient id="stripe1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
          <stop offset="50%"  stopColor="rgba(255,255,255,0.055)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Ombre perspective latérale */}
        <linearGradient id="shadowL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="rgba(0,0,0,0.35)" />
          <stop offset="18%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="shadowR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="82%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </linearGradient>
        {/* Ombre sol en bas (profondeur) */}
        <linearGradient id="shadowB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="75%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
        </linearGradient>
        {/* Brillance en haut (lumière zénithale) */}
        <linearGradient id="lightTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.07)" />
          <stop offset="22%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Filet de but — texture */}
        <pattern id="netPat" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0 L6 6 M6 0 L0 6" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
        </pattern>
        <filter id="fieldBlur">
          <feGaussianBlur stdDeviation="0.4"/>
        </filter>
      </defs>

      {/* ── FOND PELOUSE ── */}
      <rect width="400" height="860" fill="url(#pitchGrad)" />

      {/* Bandes de tonte — 8 bandes verticales alternées */}
      {[0,1,2,3,4,5,6,7].map(i => (
        <rect key={i} x={i*50} y="0" width="50" height="860"
          fill={i%2===0 ? "rgba(255,255,255,0.032)" : "rgba(0,0,0,0.025)"} />
      ))}

      {/* Ombres de perspective pour effet 3D */}
      <rect width="400" height="860" fill="url(#shadowL)" />
      <rect width="400" height="860" fill="url(#shadowR)" />
      <rect width="400" height="860" fill="url(#shadowB)" />
      <rect width="400" height="860" fill="url(#lightTop)" />

      {/* ══ LIGNES DU TERRAIN ══ */}
      {/* Bordure extérieure complète */}
      <rect x="22" y="18" width="356" height="824" fill="none"
        stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" />

      {/* ── MOITIÉ HAUTE ── */}
      {/* Surface de réparation grande */}
      <rect x="88" y="18" width="224" height="110" fill="none"
        stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      {/* Petite surface */}
      <rect x="142" y="18" width="116" height="45" fill="none"
        stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      {/* Arc de cercle surface */}
      <path d="M 142 128 A 56 56 0 0 0 258 128"
        fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      {/* But haut — structure 3D */}
      <rect x="162" y="8" width="76" height="18" fill="none"
        stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
      {/* Filet but haut */}
      <rect x="162" y="8" width="76" height="18" fill="url(#netPat)" />
      {/* Poteaux 3D haut — gauche */}
      <rect x="162" y="6" width="3" height="22" fill="rgba(255,255,255,0.85)" rx="1"/>
      <ellipse cx="163.5" cy="6" rx="1.5" ry="0.8" fill="rgba(255,255,255,0.5)"/>
      {/* Poteaux 3D haut — droite */}
      <rect x="235" y="6" width="3" height="22" fill="rgba(255,255,255,0.85)" rx="1"/>
      <ellipse cx="236.5" cy="6" rx="1.5" ry="0.8" fill="rgba(255,255,255,0.5)"/>
      {/* Barre transversale haut */}
      <rect x="162" y="6" width="76" height="2.5" fill="rgba(255,255,255,0.9)" rx="1"/>
      {/* Coin de surface haut-gauche (quart de cercle) */}
      <path d="M22 38 Q38 38 38 54" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2"/>
      {/* Coin de surface haut-droite */}
      <path d="M378 38 Q362 38 362 54" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2"/>
      {/* Point de penalty haut */}
      <circle cx="200" cy="88" r="3.5" fill="rgba(255,255,255,0.7)" />

      {/* ── LIGNE MÉDIANE ── */}
      <line x1="22" y1="430" x2="378" y2="430"
        stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" />
      {/* Rond central — ellipse légèrement aplatie pour effet 3D */}
      <ellipse cx="200" cy="430" rx="72" ry="68"
        fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" />
      {/* Point central */}
      <circle cx="200" cy="430" r="4" fill="rgba(255,255,255,0.75)" />
      {/* Demi-cercle médiane — haut */}
      <path d="M200 362 A 68 68 0 0 1 200 362" fill="none"/>

      {/* ── MOITIÉ BASSE ── */}
      {/* Surface de réparation grande basse */}
      <rect x="88" y="732" width="224" height="110" fill="none"
        stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
      {/* Petite surface basse */}
      <rect x="142" y="797" width="116" height="45" fill="none"
        stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
      {/* Arc de cercle surface basse */}
      <path d="M 142 732 A 56 56 0 0 1 258 732"
        fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
      {/* But bas — structure 3D */}
      <rect x="162" y="834" width="76" height="20" fill="none"
        stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" />
      {/* Filet but bas */}
      <rect x="162" y="834" width="76" height="20" fill="url(#netPat)" />
      {/* Poteaux 3D bas */}
      <rect x="162" y="832" width="3" height="24" fill="rgba(255,255,255,0.8)" rx="1"/>
      <rect x="235" y="832" width="3" height="24" fill="rgba(255,255,255,0.8)" rx="1"/>
      <rect x="162" y="853" width="76" height="2.5" fill="rgba(255,255,255,0.85)" rx="1"/>
      {/* Point de penalty bas */}
      <circle cx="200" cy="772" r="3.5" fill="rgba(255,255,255,0.65)" />
      {/* Coins bas */}
      <path d="M22 822 Q38 822 38 806" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"/>
      <path d="M378 822 Q362 822 362 806" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"/>

      {/* Reflet lumineux central doux */}
      <ellipse cx="200" cy="430" rx="180" ry="90"
        fill="rgba(255,255,255,0.018)" />
    </svg>
  );
}

// Court en terre battue — vue 3D perspective légère
function ClayCourtBackground() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 860" preserveAspectRatio="xMidYMin slice"
      style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}>
      <defs>
        {/* Dégradé terre battue — lumière zénithale */}
        <linearGradient id="clayGrad" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%"   stopColor="#b85a35" />
          <stop offset="35%"  stopColor="#c96a45" />
          <stop offset="65%"  stopColor="#c06040" />
          <stop offset="100%" stopColor="#9a4828" />
        </linearGradient>
        {/* Texture balayage — stries horizontales fines */}
        <pattern id="clayLines" width="400" height="4" patternUnits="userSpaceOnUse">
          <rect width="400" height="4" fill="transparent"/>
          <line x1="0" y1="3" x2="400" y2="3" stroke="rgba(0,0,0,0.06)" strokeWidth="0.8"/>
        </pattern>
        {/* Ombre perspective */}
        <linearGradient id="clayShadowL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="rgba(0,0,0,0.3)" />
          <stop offset="15%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="clayShadowR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="85%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </linearGradient>
        <linearGradient id="clayShadowB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="70%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </linearGradient>
        <linearGradient id="clayLightT" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(255,230,200,0.12)" />
          <stop offset="20%" stopColor="rgba(255,230,200,0)" />
        </linearGradient>
        {/* Reflet centre court */}
        <radialGradient id="clayCenter" cx="50%" cy="48%" r="40%">
          <stop offset="0%"  stopColor="rgba(255,200,160,0.07)" />
          <stop offset="100%" stopColor="rgba(255,200,160,0)" />
        </radialGradient>
        {/* Texture grain terre battue */}
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
          <feBlend in="SourceGraphic" mode="overlay" result="blend"/>
          <feComposite in="blend" in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>

      {/* ── FOND TERRE BATTUE ── */}
      <rect width="400" height="860" fill="url(#clayGrad)" />
      <rect width="400" height="860" fill="url(#clayLines)" />
      {/* Ombres 3D */}
      <rect width="400" height="860" fill="url(#clayShadowL)" />
      <rect width="400" height="860" fill="url(#clayShadowR)" />
      <rect width="400" height="860" fill="url(#clayShadowB)" />
      <rect width="400" height="860" fill="url(#clayLightT)" />
      <rect width="400" height="860" fill="url(#clayCenter)" />

      {/* ══ COURT COMPLET ══ */}
      {/* Couloir extérieur (doubles) */}
      <rect x="24" y="30" width="352" height="800"
        fill="rgba(180,80,40,0.18)" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5" />

      {/* Court de simple (lignes intérieures) */}
      <rect x="60" y="30" width="280" height="800"
        fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />

      {/* ── DEMI-TERRAIN HAUT ── */}
      {/* Ligne de service haute */}
      <line x1="60" y1="220" x2="340" y2="220"
        stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
      {/* Ligne centrale (T) haute */}
      <line x1="200" y1="30" x2="200" y2="220"
        stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
      {/* Cases de service */}
      <rect x="60" y="30" width="140" height="190"
        fill="rgba(0,0,0,0.04)" />
      <rect x="200" y="30" width="140" height="190"
        fill="rgba(255,255,255,0.025)" />

      {/* ── DEMI-TERRAIN BAS ── */}
      {/* Ligne de service basse */}
      <line x1="60" y1="640" x2="340" y2="640"
        stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
      {/* Ligne centrale (T) basse */}
      <line x1="200" y1="640" x2="200" y2="830"
        stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
      {/* Cases de service basses */}
      <rect x="60" y="640" width="140" height="190"
        fill="rgba(255,255,255,0.025)" />
      <rect x="200" y="640" width="140" height="190"
        fill="rgba(0,0,0,0.04)" />

      {/* ── FILET 3D ── */}
      {/* Poteau gauche */}
      <rect x="22" y="416" width="5" height="28"
        fill="rgba(255,255,255,0.9)" rx="1.5" />
      <ellipse cx="24.5" cy="416" rx="2.5" ry="1.5"
        fill="rgba(255,255,255,0.6)" />
      {/* Poteau droit */}
      <rect x="373" y="416" width="5" height="28"
        fill="rgba(255,255,255,0.9)" rx="1.5" />
      <ellipse cx="375.5" cy="416" rx="2.5" ry="1.5"
        fill="rgba(255,255,255,0.6)" />
      {/* Câble du filet — légèrement courbé pour le réalisme */}
      <path d="M24 417 Q200 412 376 417"
        fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" />
      {/* Corps du filet — mailles */}
      {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
        <line key={i}
          x1={24 + i*28} y1="417"
          x2={24 + i*28} y2="444"
          stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
      ))}
      {[0,1,2,3].map(i => (
        <line key={i}
          x1="24" y1={420 + i*8}
          x2="376" y2={420 + i*8}
          stroke="rgba(255,255,255,0.2)" strokeWidth="0.6"/>
      ))}
      {/* Bas du filet */}
      <line x1="24" y1="444" x2="376" y2="444"
        stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />

      {/* ── MARQUES DE FOND DE COURT ── */}
      {/* Lignes de fond haut — épaississement 3D */}
      <line x1="24" y1="30" x2="376" y2="30"
        stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
      <line x1="24" y1="830" x2="376" y2="830"
        stroke="rgba(255,255,255,0.7)" strokeWidth="3" />

      {/* Marques de centre haut et bas */}
      <line x1="197" y1="27" x2="203" y2="27"
        stroke="rgba(255,255,255,0.8)" strokeWidth="2.5"/>
      <line x1="197" y1="833" x2="203" y2="833"
        stroke="rgba(255,255,255,0.7)" strokeWidth="2.5"/>

      {/* Reflet lumineux doux au centre */}
      <ellipse cx="200" cy="430" rx="120" ry="60"
        fill="rgba(255,220,180,0.04)" />
    </svg>
  );
}



// ─── LOGO BETTRUST ────────────────────────────────────────────────
// Monogramme BT avec check vert — déclinaisons : dark / light / white
function BetTrustLogo({ size = 40, variant = "dark" }) {
  // variant: "dark" = fond vert profond #0B3B2E (pour fond clair)
  //          "black" = fond noir (pour dark mode)
  //          "light" = fond blanc, lettres vert profond (pour fond coloré)
  const bg = variant === "light" ? "#FFFFFF" : variant === "black" ? "#0A0A0A" : "#0B3B2E";
  const letterColor = variant === "light" ? "#0B3B2E" : "#FFFFFF";
  const checkColor = "#16A34A";
  const r = Math.round(size * 0.22);
  const w = Math.round(size * 0.72);
  const h = Math.round(size * 0.64);
  return (
    <div style={{width:size, height:size, borderRadius:r, background:bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
      <svg width={w} height={h} viewBox="0 0 130 110" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 15 H45 C58 15 58 35 45 35 H10 Z M10 35 H50 C65 35 65 58 48 58 H10 Z" fill={letterColor}/>
        <path d="M70 15 H120 M92 15 V58" stroke={letterColor} strokeWidth="9" strokeLinecap="round"/>
        <path d="M78 72 L92 86 L118 58" stroke={checkColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function BetTrustLockup({ size = 32, light = false }) {
  // light=true : sur fond sombre (hero), texte blanc + menthe
  // light=false : sur fond clair (header), texte foncé + vert
  const textColor = light ? "#FFFFFF" : "#111827";
  const accentColor = light ? "#6EE7B7" : "#16A34A";
  const logoVariant = light ? "dark" : "dark"; // logo fond vert profond dans les deux cas
  return (
    <div style={{display:"flex", alignItems:"center", gap:Math.round(size * 0.28)}}>
      <BetTrustLogo size={size} variant={logoVariant} />
      <span style={{fontSize:Math.round(size * 0.6), fontWeight:900, color:textColor, letterSpacing:-0.5, lineHeight:1}}>
        Bet<span style={{color:accentColor}}>Trust</span>
      </span>
    </div>
  );
}

// ─── HERO SCREEN (avant connexion) ────────────────────────────────
function HeroScreen({ onEnter }) {
  const [phase, setPhase] = useState(0);
  const [typedSlogan, setTypedSlogan] = useState("");
  const [showButtons, setShowButtons] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const slogan = "L'IA au service de vos décisions.";

  const loadingSteps = [
    { label: "Connexion aux serveurs IA", pct: 20 },
    { label: "Chargement des marchés sportifs", pct: 45 },
    { label: "Calibration des algorithmes", pct: 68 },
    { label: "Synchronisation des cotes", pct: 85 },
    { label: "Prêt à analyser", pct: 100 },
  ];

  // Réveille le serveur Render en arrière-plan dès que le Hero s'affiche
  useEffect(() => {
    const wakeServer = async () => {
      try {
        await fetch(`${BACKEND_URL}/`, { method: "GET" });
      } catch(e) {}
      setServerReady(true);
    };
    wakeServer();
  }, []);

  // Simule la progression de la barre de chargement
  useEffect(() => {
    const timings = [800, 1800, 2800, 3800, 5200];
    const timers = timings.map((delay, i) =>
      setTimeout(() => setLoadingStep(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const interval = setInterval(() => {
      setTypedSlogan(slogan.slice(0, i + 1));
      i++;
      if (i >= slogan.length) { clearInterval(interval); setTimeout(() => setShowButtons(true), 300); }
    }, 38);
    return () => clearInterval(interval);
  }, [phase]);

  const tickers = [
    { label:"Alcaraz vs Sinner", val:"💎 Value +14pts", col:"#4ade80" },
    { label:"PSG vs Lyon", val:"🪤 Piège détecté", col:"#f87171" },
    { label:"Djokovic vs Hurkacz", val:"⚡ Conf. 8/10", col:"#60a5fa" },
    { label:"Real vs Barça", val:"💎 Value +11pts", col:"#4ade80" },
    { label:"Man City vs Arsenal", val:"⚖️ Cote juste", col:"#a3a3a3" },
    { label:"Swiatek vs Sabalenka", val:"🪤 Piège détecté", col:"#f87171" },
    { label:"Bayern vs Dortmund", val:"💎 Value +9pts", col:"#4ade80" },
    { label:"Fritz vs Zverev", val:"⚡ Conf. 7/10", col:"#60a5fa" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"#060f0a",fontFamily:"'Inter',system-ui,sans-serif",overflow:"hidden",position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <style>{`
        @keyframes logoIn { from{opacity:0;transform:scale(0.6) rotate(-8deg)} to{opacity:1;transform:scale(1) rotate(0deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tickerScroll { from{transform:translateY(0)} to{transform:translateY(-50%)} }
        @keyframes glowPulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes btnShine { from{background-position:-200% center} to{background-position:200% center} }
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* Grille de fond */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.07,pointerEvents:"none"}} preserveAspectRatio="none">
        <defs><pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16a34a" strokeWidth="0.5"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#heroGrid)" />
      </svg>

      {/* Halo central */}
      <div style={{position:"absolute",top:"38%",left:"50%",transform:"translate(-50%,-50%)",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(22,163,74,0.2) 0%,transparent 70%)",animation:"glowPulse 3s ease-in-out infinite",pointerEvents:"none"}} />

      {/* Ticker droit */}
      <div style={{position:"absolute",right:0,top:0,bottom:0,width:160,overflow:"hidden",opacity:0.3,pointerEvents:"none"}}>
        <div style={{display:"flex",flexDirection:"column",animation:"tickerScroll 18s linear infinite"}}>
          {[...tickers,...tickers].map((t,i)=>(
            <div key={i} style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>{t.label}</div>
              <div style={{fontSize:11,fontWeight:700,color:t.col}}>{t.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker gauche */}
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:130,overflow:"hidden",opacity:0.2,pointerEvents:"none"}}>
        <div style={{display:"flex",flexDirection:"column",animation:"tickerScroll 24s linear infinite reverse"}}>
          {[...tickers,...tickers].map((t,i)=>(
            <div key={i} style={{padding:"10px 10px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <div style={{fontSize:9,color:"#4b5563",marginBottom:2}}>{t.label}</div>
              <div style={{fontSize:10,fontWeight:700,color:t.col}}>{t.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contenu central */}
      <div style={{position:"relative",zIndex:10,textAlign:"center",padding:"0 32px",maxWidth:400}}>
        <div style={{opacity:phase>=1?1:0,animation:phase>=1?"logoIn 0.6s cubic-bezier(.34,1.56,.64,1) both":"none",margin:"0 auto 22px",width:"fit-content",filter:"drop-shadow(0 0 24px rgba(22,163,74,0.55))"}}>  <BetTrustLogo size={80} variant="dark" /></div>

        <div style={{fontSize:44,fontWeight:900,color:"#fff",letterSpacing:-1.5,marginBottom:12,opacity:phase>=1?undefined:0,animation:phase>=1?"fadeUp 0.5s ease 0.2s both":"none"}}>
          Bet<span style={{color:"#6EE7B7"}}>Trust</span>
        </div>

        <div style={{fontSize:16,color:"#86efac",fontWeight:500,marginBottom:36,minHeight:26,opacity:phase>=2?undefined:0,animation:phase>=2?"fadeUp 0.4s ease both":"none"}}>
          {typedSlogan}
          {typedSlogan.length < slogan.length && typedSlogan.length > 0 && (
            <span style={{animation:"cursorBlink 0.7s infinite",color:"#4ade80"}}>|</span>
          )}
        </div>

        {showButtons && (
          <div style={{display:"flex",justifyContent:"center",gap:28,marginBottom:28,animation:"fadeUp 0.4s ease both"}}>
            {[{val:"360°",label:"Analyse IA"},{val:"💎",label:"Value bets"},{val:"📡",label:"Radar du jour"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center",animation:`fadeUp 0.4s ease ${i*0.08}s both`}}>
                <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>{s.val}</div>
                <div style={{fontSize:10,color:"#6b7280",marginTop:3,fontWeight:600}}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Barre de chargement stylisée — réveille le serveur pendant l'animation */}
        {showButtons && (
          <div style={{width:"100%",marginBottom:24,animation:"fadeUp 0.4s ease 0.1s both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:"#4b5563",fontWeight:600}}>
                {loadingStep < loadingSteps.length ? loadingSteps[loadingStep]?.label : "Prêt à analyser"}
              </span>
              <span style={{fontSize:11,color:loadingStep >= loadingSteps.length ? "#4ade80" : "#6b7280",fontWeight:700}}>
                {loadingStep >= loadingSteps.length ? "✓ Prêt" : `${loadingSteps[Math.min(loadingStep, loadingSteps.length-1)]?.pct}%`}
              </span>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,0.1)",borderRadius:99,overflow:"hidden"}}>
              <div style={{
                height:"100%",
                width:`${loadingStep >= loadingSteps.length ? 100 : loadingSteps[Math.min(loadingStep, loadingSteps.length-1)]?.pct || 0}%`,
                background: loadingStep >= loadingSteps.length
                  ? "linear-gradient(90deg,#4ade80,#16a34a)"
                  : "linear-gradient(90deg,#16a34a,#4ade80,#16a34a)",
                backgroundSize:"200% auto",
                borderRadius:99,
                transition:"width 0.8s cubic-bezier(.4,0,.2,1)",
                animation: loadingStep < loadingSteps.length ? "shimmer 1.5s linear infinite" : "none",
              }}/>
            </div>
          </div>
        )}

        {showButtons && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp 0.5s ease 0.2s both"}}>
            <button onClick={()=>onEnter("register")} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",background:"linear-gradient(90deg,#16a34a,#22c55e,#16a34a)",backgroundSize:"200% auto",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 24px rgba(22,163,74,0.4)",animation:"btnShine 3s linear infinite"}}>
              Commencer — 4 jours gratuits →
            </button>
            <button onClick={()=>onEnter("login")} style={{width:"100%",padding:"14px 0",borderRadius:14,border:"1.5px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.75)",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              J'ai déjà un compte
            </button>
          </div>
        )}

        {showButtons && (
          <div style={{marginTop:20,fontSize:11,color:"#374151",lineHeight:1.6,animation:"fadeUp 0.4s ease 0.4s both"}}>
            Outil d'analyse complémentaire · Aucun pari géré<br/>Paiement sécurisé par Stripe
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────
function AuthScreen({ onLogin, initialTab = "login" }) {
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    setErr(""); setLoading(true);
    if (!email || !password) { setErr("Remplis tous les champs."); setLoading(false); return; }

    if (tab === "register") {
      if (!name) { setErr("Entre ton prénom."); setLoading(false); return; }
      if (password.length < 6) { setErr("Le mot de passe doit faire au moins 6 caractères."); setLoading(false); return; }

      // Inscription via Supabase — envoie automatiquement un email de confirmation
      const res = await sb.signUp(email, password, {
        name,
        coach_name: generateCoachName(email),
      });

      if (res.error) {
        setErr(res.error.message === "User already registered"
          ? "Email déjà utilisé. Essaie de te connecter."
          : res.error.message || "Erreur lors de l'inscription.");
        setLoading(false); return;
      }

      // Email de confirmation envoyé — on attend la validation
      setConfirmSent(true);
      setLoading(false);

    } else {
      // Connexion via Supabase
      const res = await sb.signIn(email, password);

      if (res.error) {
        setErr(res.error.message === "Email not confirmed"
          ? "Confirme d'abord ton email — vérifie ta boîte mail."
          : "Email ou mot de passe incorrect.");
        setLoading(false); return;
      }

      const token = res.access_token;
      const userData = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.user_metadata?.name || "Utilisateur",
        coachName: res.user.user_metadata?.coach_name || generateCoachName(res.user.email),
        token,
      };

      onLogin(userData);
    }
    setLoading(false);
  };

  if (confirmSent) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{background:"#fff",borderRadius:22,padding:"36px 28px",width:"100%",maxWidth:390,boxShadow:"0 8px 40px rgba(0,0,0,0.08)",textAlign:"center"}}>
          <div style={{fontSize:50,marginBottom:16}}>📧</div>
          <div style={{fontSize:20,fontWeight:900,color:"#111827",marginBottom:10}}>Vérifie ta boîte mail !</div>
          <div style={{fontSize:14,color:C.gray,marginBottom:20,lineHeight:1.6}}>
            Un email de confirmation a été envoyé à <strong>{email}</strong>.<br/>
            Clique sur le lien dans l'email pour activer ton compte, puis reviens te connecter.
          </div>
          <button onClick={()=>{setConfirmSent(false);setTab("login");}} style={{width:"100%",background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:11,padding:"13px 0",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
            Se connecter →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:22,padding:"36px 28px",width:"100%",maxWidth:390,boxShadow:"0 8px 40px rgba(0,0,0,0.08)"}}>
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{margin:"0 auto 12px",width:"fit-content"}}><BetTrustLogo size={50} variant="dark" /></div>
          <div style={{fontSize:23,fontWeight:900,color:"#111827",letterSpacing:-0.5}}>BetTrust</div>
          <div style={{fontSize:13,color:C.gray,marginTop:3}}>L'IA au service de vos décisions.</div>
        </div>
        <div style={{display:"flex",background:"#f3f4f6",borderRadius:12,padding:4,marginBottom:20}}>
          {["login","register"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setErr("");}} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",
              background:tab===t?"#fff":"transparent",color:tab===t?C.green:C.gray,boxShadow:tab===t?"0 1px 6px rgba(0,0,0,0.08)":"none"}}>
              {t==="login"?"Connexion":"Créer un compte"}
            </button>
          ))}
        </div>
        {tab==="register" && <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.gray,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.6}}>Prénom</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ton prénom" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}} /></div>}
        {[{l:"Email",v:email,s:setEmail,t:"email",p:"ton@email.com"},{l:"Mot de passe",v:password,s:setPassword,t:"password",p:"••••••••"}].map(f=>(
          <div key={f.l} style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.gray,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.6}}>{f.l}</label><input type={f.t} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p} style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}} /></div>
        ))}
        {err && <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:9,padding:"9px 12px",fontSize:13,color:"#dc2626",marginBottom:14,fontWeight:500}}>{err}</div>}
        <button onClick={submit} style={{width:"100%",background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:11,padding:"13px 0",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
          {loading?"...":(tab==="login"?"Se connecter →":"Créer mon compte →")}
        </button>
        {tab==="login" && (
          <div style={{textAlign:"center",marginTop:12}}>
            <button onClick={async()=>{
              if(!email){setErr("Entre ton email d'abord.");return;}
              await fetch(`${SUPABASE_URL}/auth/v1/recover`,{method:"POST",headers:sb.headers,body:JSON.stringify({email})});
              setErr("Email de réinitialisation envoyé !");
            }} style={{background:"none",border:"none",color:C.gray,fontSize:13,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
              Mot de passe oublié ?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ÉCRAN DE CONSENTEMENT (à valider une fois après inscription) ──

// ─── ÉCRAN D'EXCLUSIVITÉ (affiché une seule fois après le consentement) ──
function ExclusivityScreen({ onContinue }) {
  const competitions = [
    { icon: "🏆", name: "Ligue 1", country: "France" },
    { icon: "🏆", name: "Premier League", country: "Angleterre" },
    { icon: "🏆", name: "La Liga", country: "Espagne" },
    { icon: "🏆", name: "Bundesliga", country: "Allemagne" },
    { icon: "🏆", name: "Serie A", country: "Italie" },
    { icon: "🌍", name: "Champions League", country: "Europe" },
    { icon: "🌍", name: "Europa League", country: "Europe" },
    { icon: "🎾", name: "Wimbledon", country: "Grand Chelem" },
    { icon: "🎾", name: "Roland-Garros", country: "Grand Chelem" },
    { icon: "🎾", name: "US Open", country: "Grand Chelem" },
    { icon: "🎾", name: "Australian Open", country: "Grand Chelem" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"#060f0a",fontFamily:"'Inter',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px"}}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shine { from{background-position:-200% center} to{background-position:200% center} }
      `}</style>

      {/* Logo */}
      <div style={{marginBottom:24,animation:"fadeUp 0.5s ease both"}}>
        <BetTrustLogo size={56} variant="dark" />
      </div>

      {/* Titre */}
      <div style={{textAlign:"center",marginBottom:8,animation:"fadeUp 0.5s ease 0.1s both",opacity:0}}>
        <div style={{fontSize:11,color:"#16a34a",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
          Positionnement exclusif
        </div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5,lineHeight:1.2}}>
          BetTrust analyse<br/>uniquement l'élite.
        </div>
      </div>

      {/* Explication */}
      <div style={{fontSize:14,color:"#6b7280",textAlign:"center",maxWidth:340,lineHeight:1.7,marginBottom:28,animation:"fadeUp 0.5s ease 0.2s both",opacity:0}}>
        Notre IA est entraînée sur les données des compétitions où les marchés sont les plus liquides, les informations les plus fiables, et l'analyse la plus pertinente. Ailleurs, les données manquent — nous n'analyserons jamais au hasard.
      </div>

      {/* Séparateur */}
      <div style={{width:40,height:2,background:"linear-gradient(90deg,transparent,#16a34a,transparent)",marginBottom:24,animation:"fadeUp 0.4s ease 0.25s both",opacity:0}} />

      {/* Liste compétitions */}
      <div style={{width:"100%",maxWidth:360,marginBottom:32,animation:"fadeUp 0.5s ease 0.3s both",opacity:0}}>
        <div style={{fontSize:11,color:"#374151",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:14,textAlign:"center"}}>
          Compétitions couvertes
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {competitions.map((c,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(22,163,74,0.2)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>{c.icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{c.name}</div>
                <div style={{fontSize:10,color:"#6b7280"}}>{c.country}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message exclusivité */}
      <div style={{background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.2)",borderRadius:14,padding:"14px 18px",maxWidth:340,marginBottom:28,textAlign:"center",animation:"fadeUp 0.5s ease 0.4s both",opacity:0}}>
        <div style={{fontSize:13,color:"#86efac",fontWeight:600,lineHeight:1.6}}>
          💡 Les autres championnats ? Trop peu de données fiables pour analyser sans risque. Nous préférons ne rien dire plutôt que de mal analyser.
        </div>
      </div>

      {/* Bouton */}
      <button onClick={onContinue} style={{
        width:"100%",maxWidth:340,
        background:"linear-gradient(90deg,#16a34a,#22c55e,#16a34a)",
        backgroundSize:"200% auto",
        color:"#fff",border:"none",borderRadius:14,
        padding:"16px 0",fontSize:16,fontWeight:800,
        cursor:"pointer",fontFamily:"inherit",
        animation:"fadeUp 0.5s ease 0.5s both, shine 3s linear 1s infinite",
        opacity:0,
      }}>
        Accéder à BetTrust →
      </button>

      <div style={{fontSize:11,color:"#374151",marginTop:14,animation:"fadeUp 0.4s ease 0.6s both",opacity:0}}>
        Ces compétitions représentent 90% du volume de paris mondial.
      </div>
    </div>
  );
}

function ConsentScreen({ user, onAccept }) {
  const [checked, setChecked] = useState(false);

  const accept = async () => {
    await saveConsent(user.email);
    onAccept();
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:22,padding:"32px 28px",width:"100%",maxWidth:440,boxShadow:"0 8px 40px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:36,marginBottom:14,textAlign:"center"}}>⚠️</div>
        <div style={{fontSize:19,fontWeight:900,color:"#111827",marginBottom:16,textAlign:"center"}}>Avant de continuer</div>

        <div style={{background:"#f9fafb",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"18px 20px",marginBottom:20,fontSize:13,color:"#374151",lineHeight:1.65}}>
          <p style={{marginBottom:12}}>
            BetTrust est un outil <strong>complémentaire</strong> d'analyse statistique. Nos analyses t'aident à mieux comprendre un match, mais elles ne garantissent <strong>aucun résultat</strong>.
          </p>
          <p style={{marginBottom:12}}>
            Les paris sportifs comportent toujours une part de hasard, quelle que soit la qualité de l'analyse fournie. Même une analyse poussée peut se tromper : le sport reste imprévisible.
          </p>
          <p>
            Tu restes seul responsable de tes décisions de paris et des sommes que tu engages sur les plateformes tierces (Winamax, Betclic, Unibet...). BetTrust ne peut être tenu responsable des pertes éventuelles liées à l'utilisation de ses analyses.
          </p>
        </div>

        <label style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:22,cursor:"pointer"}}>
          <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} style={{marginTop:3,width:18,height:18,accentColor:C.green,flexShrink:0,cursor:"pointer"}} />
          <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>J'ai compris et j'accepte que BetTrust est un outil d'aide à la décision, sans garantie de gain, et que je reste seul responsable de mes paris.</span>
        </label>

        <button onClick={accept} disabled={!checked} style={{width:"100%",background: checked ? `linear-gradient(135deg,${C.green},#22c55e)` : "#e5e7eb",color: checked ? "#fff" : "#9ca3af",border:"none",borderRadius:13,padding:"14px 0",fontSize:15,fontWeight:800,cursor: checked ? "pointer" : "default",fontFamily:"inherit"}}>
          J'accepte et je continue →
        </button>
      </div>
    </div>
  );
}

// ─── DEMANDE D'AVIS (déclenchée après un premier pari gagné) ───────
function RatingPrompt({ user, onDone }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    await saveAppRating(user.email, stars, comment);
    await saveRatingGiven(user.email);
    setSubmitted(true);
    setTimeout(onDone, 1400);
  };

  const dismiss = async () => {
    await saveRatingDismissed(user.email);
    onDone();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:22,padding:"32px 28px",width:"100%",maxWidth:380,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",textAlign:"center"}}>
        {submitted ? (
          <div>
            <div style={{fontSize:40,marginBottom:10}}>🙌</div>
            <div style={{fontSize:17,fontWeight:900,color:"#111827"}}>Merci pour ton avis !</div>
          </div>
        ) : (
          <div>
            <div style={{fontSize:38,marginBottom:10}}>🎉</div>
            <div style={{fontSize:18,fontWeight:900,color:"#111827",marginBottom:6}}>Ton pari est passé !</div>
            <div style={{fontSize:13,color:C.gray,marginBottom:22,lineHeight:1.5}}>Comment trouves-tu l'expérience BetTrust jusqu'ici ?</div>
            <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:24}}>
              {[1,2,3,4,5].map(n=>(
                <span key={n} onClick={()=>setStars(n)} onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)} style={{fontSize:32,cursor:"pointer",color:(hover||stars)>=n?"#fbbf24":"#e5e7eb",transition:"color 0.1s"}}>★</span>
              ))}
            </div>
            {stars>0 && (
              <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Un mot sur ton expérience (facultatif)" rows={3}
                style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 13px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",resize:"none",marginBottom:18}} />
            )}
            <button onClick={submit} disabled={stars===0} style={{width:"100%",background: stars>0 ? `linear-gradient(135deg,${C.green},#22c55e)` : "#e5e7eb",color: stars>0 ? "#fff" : "#9ca3af",border:"none",borderRadius:12,padding:"12px 0",fontSize:14,fontWeight:800,cursor: stars>0 ? "pointer" : "default",fontFamily:"inherit",marginBottom:10}}>
              Envoyer mon avis
            </button>
            <button onClick={dismiss} style={{width:"100%",background:"none",border:"none",color:C.gray,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}}>
              Pas maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function AnalysisPanel({ match, onClose }) {
  const [analysis, setAnalysis] = useState(null); const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); try { setAnalysis(await analyzeMatch(match)); } catch(e) { setAnalysis("Erreur réseau."); } setLoading(false); };
  // Rendu propre et visuel de l'analyse
  const renderAnalysis = (text) => {
    if (!text) return null;

    // Nettoyage agressif de tout le markdown
    const cleanMd = (s) => s
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/[`]/g, '')
      .replace(/#{1,4}\s*/g, '')
      .replace(/^[-•*]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\|/g, ' ')
      .trim();

    // Nettoie TOUT le texte d'abord
    const cleanedText = text.split('\n').map(cleanMd).join('\n');

    // Détecte les sections clés
    const isVerdict = (l) => l.startsWith('⚡');
    const isConfiance = (l) => l.startsWith('🎯 CONFIANCE') || l.match(/^confiance\s*:/i);
    const isSignal = (l) => l.startsWith('🔍') || l.includes('VALUE BET') || l.includes('PIÈGE') || l.includes('Cote juste');
    const isBest = (l) => l.startsWith('🏆') || l.startsWith('💰 LE MEILLEUR') || l.includes('MEILLEUR PARI');
    const isWarning = (l) => l.startsWith('⚠️');
    const isBetsTitle = (l) => l.startsWith('🎯 TOUS') || l.includes('PARIS RECOMMANDÉS');
    const isBetItem = (l) => l.startsWith('→') || (l.match(/^[A-Z]/) && l.includes('@') && l.includes('—'));
    const isSectionTitle = (l) => l.startsWith('📊') || l.startsWith('📋') || l.startsWith('👥') || l.startsWith('⚽');

    const lines = cleanedText.split('\n').filter(l => l.trim() && l.trim() !== '---');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const l = lines[i].trim();

      if (isVerdict(l)) {
        const text = l.replace(/^⚡\s*/, '').replace(/VERDICT\s*:\s*/i, '');
        const isVal = text.toUpperCase().includes('VALUE') || text.toUpperCase().includes('COBOLLI') || text.toUpperCase().includes('OUTSIDER');
        const isPieg = text.toUpperCase().includes('PIÈGE') || text.toUpperCase().includes('PIEGE') || text.toUpperCase().includes('FAVORIT');
        const bg = isVal ? 'linear-gradient(135deg,#052e16,#166534)' : isPieg ? 'linear-gradient(135deg,#450a0a,#991b1b)' : 'linear-gradient(135deg,#0f172a,#1e293b)';
        elements.push(
          <div key={i} style={{background:bg,borderRadius:16,padding:"18px 20px",marginBottom:12}} className="anim-scalein">
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>⚡ Verdict</div>
            <div style={{fontSize:17,fontWeight:900,color:"#fff",lineHeight:1.4}}>{text}</div>
          </div>
        );

      } else if (isConfiance(l)) {
        const match = l.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
        const score = match ? parseFloat(match[1]) : null;
        const pct = score ? score * 10 : 0;
        const col = pct >= 70 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626';
        elements.push(
          <div key={i} style={{background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:10}} className="anim-fadeup">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:score?10:0}}>
              <span style={{fontSize:12,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.8}}>Confiance</span>
              <span style={{fontSize:20,fontWeight:900,color:col}}>{score ? `${score}/10` : l.replace(/.*confiance\s*:\s*/i,'')}</span>
            </div>
            {score && <div style={{height:8,background:"#f1f5f9",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${col},${col}cc)`,borderRadius:99,transition:"width 1s ease"}}/>
            </div>}
          </div>
        );

      } else if (isSignal(l)) {
        const isVal = l.includes('💎') || l.toUpperCase().includes('VALUE');
        const isPieg = l.includes('🪤') || l.toUpperCase().includes('PIÈGE') || l.toUpperCase().includes('PIEGE');
        const col = isVal ? '#16a34a' : isPieg ? '#dc2626' : '#ca8a04';
        const bg = isVal ? '#f0fdf4' : isPieg ? '#fef2f2' : '#fffbeb';
        const bord = isVal ? '#86efac' : isPieg ? '#fca5a5' : '#fde68a';
        const icon = isVal ? '💎' : isPieg ? '🪤' : '⚖️';
        const label = isVal ? 'Value bet détecté' : isPieg ? 'Piège identifié' : 'Cote juste';
        const detail = l.replace(/^🔍.*?:\s*/,'').replace(/💎|🪤|⚖️/g,'').replace(/VALUE BET|PIÈGE|Cote juste/gi,'').trim();
        elements.push(
          <div key={i} style={{background:bg,border:`2px solid ${bord}`,borderRadius:14,padding:"14px 16px",marginBottom:12,display:"flex",gap:12,alignItems:"flex-start"}} className="anim-fadeup">
            <span style={{fontSize:28,lineHeight:1,flexShrink:0}}>{icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:col,marginBottom:4}}>{label}</div>
              {detail && <div style={{fontSize:12,color:col,opacity:0.85,lineHeight:1.6}}>{detail}</div>}
            </div>
          </div>
        );

      } else if (isBest(l)) {
        const title = l.replace(/^🏆\s*/,'').replace(/^💰\s*/,'').replace(/LE MEILLEUR PARI DU MATCH\s*:?\s*/i,'').trim();
        const extras = [];
        i++;
        while (i < lines.length && !isVerdict(lines[i]) && !isSectionTitle(lines[i]) && !isWarning(lines[i]) && !isBetsTitle(lines[i])) {
          if (lines[i].trim()) extras.push(lines[i].trim());
          i++;
        }
        i--;
        elements.push(
          <div key={`best-${i}`} style={{background:"linear-gradient(135deg,#052e16,#16a34a)",borderRadius:16,padding:"18px 20px",marginBottom:12,marginTop:4}} className="anim-scalein">
            <div style={{fontSize:10,color:"#86efac",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🏆 Meilleur pari du match</div>
            {title && <div style={{fontSize:15,color:"#fff",fontWeight:800,lineHeight:1.5,marginBottom:extras.length?10:0}}>{title}</div>}
            {extras.map((e,j) => <div key={j} style={{fontSize:12,color:"#bbf7d0",lineHeight:1.6,marginTop:4}}>{e}</div>)}
          </div>
        );

      } else if (isBetsTitle(l)) {
        const items = [];
        i++;
        while (i < lines.length && (isBetItem(lines[i]) || (lines[i].trim() && !isVerdict(lines[i]) && !isBest(lines[i]) && !isWarning(lines[i]) && !isSectionTitle(lines[i])))) {
          if (lines[i].trim()) items.push(lines[i].trim());
          i++;
        }
        i--;
        elements.push(
          <div key={`bets-${i}`} style={{marginBottom:14}} className="anim-fadeup">
            <div style={{fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:3,height:14,background:"#7c3aed",borderRadius:99}}/>
              Tous les paris recommandés
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {items.map((item,j) => {
                const confMatch = item.match(/(\d+)\/10/);
                const conf = confMatch ? parseInt(confMatch[1]) : null;
                const isGood = conf ? conf >= 7 : item.toUpperCase().includes('VALUE');
                return (
                  <div key={j} style={{background:isGood?"#f0fdf4":"#fff",border:`1.5px solid ${isGood?"#86efac":C.border}`,borderRadius:12,padding:"12px 14px"}}>
                    <div style={{fontSize:13,color:isGood?"#166534":"#374151",fontWeight:600,lineHeight:1.6}}>{item.replace(/^→\s*/,'')}</div>
                    {conf && <div style={{marginTop:6,height:4,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${conf*10}%`,background:isGood?"#16a34a":"#ca8a04",borderRadius:99}}/>
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        );

      } else if (isWarning(l)) {
        const txt = l.replace(/^⚠️\s*/,'');
        elements.push(
          <div key={i} style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"12px 14px",marginBottom:10,display:"flex",gap:10}} className="anim-fadeup">
            <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
            <div style={{fontSize:13,color:"#92400e",lineHeight:1.6}}>{txt}</div>
          </div>
        );

      } else if (isSectionTitle(l)) {
        const title = l.replace(/^[📊📋👥⚽]\s*/,'').replace(/ANALYSE INSIDER\s*:?/i,'Analyse insider').replace(/MARCHÉS?\s*AVEC\s*SIGNAL\s*:?/i,'Marchés avec signal');
        const items = [];
        i++;
        while (i < lines.length && !isVerdict(lines[i]) && !isConfiance(lines[i]) && !isSignal(lines[i]) && !isBest(lines[i]) && !isWarning(lines[i]) && !isBetsTitle(lines[i]) && !isSectionTitle(lines[i])) {
          if (lines[i].trim()) items.push(lines[i].trim());
          i++;
        }
        i--;
        elements.push(
          <div key={`sec-${i}`} style={{marginBottom:14}} className="anim-fadeup">
            <div style={{fontSize:11,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:14,background:"#16a34a",borderRadius:99}}/>
              {title}
            </div>
            {items.length > 0 && (
              <div style={{background:"#fff",borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
                {items.map((item,j) => (
                  <div key={j} style={{padding:"10px 14px",borderBottom:j<items.length-1?`1px solid ${C.border}`:"none",fontSize:13,color:"#374151",lineHeight:1.65}}>{item}</div>
                ))}
              </div>
            )}
          </div>
        );

      } else if (l.trim()) {
        // Texte générique propre
        elements.push(
          <div key={i} style={{fontSize:13,color:"#4b5563",lineHeight:1.7,padding:"3px 0"}}>{l}</div>
        );
      }

      i++;
    }

    return elements.length > 0 ? elements : <div style={{fontSize:13,color:"#4b5563",lineHeight:1.7}}>{cleanedText}</div>;
  };

  const lines = renderAnalysis(analysis);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f8fafb",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        {/* Header */}
        <div style={{background:"#fff",padding:"16px 20px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:C.gray,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{match.sport==="football"?"⚽ Football — Analyse multi-marchés":"🎾 Tennis — Analyse IA 360°"}</div>
            <div style={{fontSize:16,fontWeight:900,color:"#111827",letterSpacing:-0.3}}>{match.p1} <span style={{color:C.gray,fontWeight:400}}>vs</span> {match.p2}</div>
            <div style={{fontSize:11,color:C.gray,marginTop:2}}>{match.tournament} · {match.date} · {match.bookmaker}</div>
          </div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:34,height:34,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"16px 18px",overflowY:"auto",flex:1}}>
          {!analysis && !loading && (
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{fontSize:48,marginBottom:16}} className="anim-float">{match.sport==="football"?"⚽":"🎾"}</div>
              <div style={{fontSize:18,fontWeight:900,color:"#111827",marginBottom:8}}>Prêt à analyser</div>
              <div style={{fontSize:13,color:C.gray,marginBottom:24,lineHeight:1.7,maxWidth:280,margin:"0 auto 24px"}}>
                {match.sport==="football"
                  ? "Compositions · Cotes · Buteurs · Tirs · Mi-temps · Tous les marchés"
                  : "Forme · Physique · Mental · Météo · Aces · Jeux · Handicap · Score exact"}
              </div>
              <button onClick={run} className="btn-hover" style={{background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:14,padding:"14px 36px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(22,163,74,0.35)"}}>
                Lancer l'analyse →
              </button>
            </div>
          )}

          {loading && (
            <div style={{textAlign:"center",padding:"36px 0"}}>
              <style>{`
                @keyframes loupeSearch {
                  0%   { transform: translate(0,0) rotate(0deg); }
                  20%  { transform: translate(12px,-8px) rotate(15deg); }
                  40%  { transform: translate(-8px,10px) rotate(-10deg); }
                  60%  { transform: translate(10px,6px) rotate(20deg); }
                  80%  { transform: translate(-6px,-10px) rotate(-5deg); }
                  100% { transform: translate(0,0) rotate(0deg); }
                }
                @keyframes stepFade { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }
              `}</style>
              <div style={{fontSize:52,marginBottom:20,display:"inline-block",animation:"loupeSearch 2.4s ease-in-out infinite"}}>🔍</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:16}}>Analyse en cours...</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:260,margin:"0 auto"}}>
                {[
                  {icon:"📊",text:"Déconstruction des cotes"},
                  {icon:"🧬",text:"Analyse physique & mentale"},
                  {icon:"🌦️",text:"Conditions & contexte"},
                  {icon:"💎",text:"Détection value & pièges"},
                  {icon:"🏆",text:"Décisions finales multi-marchés"},
                ].map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#f9fafb",borderRadius:10,padding:"8px 14px",animation:`stepFade 2s ease-in-out ${i*0.4}s infinite`}}>
                    <span style={{fontSize:16}}>{s.icon}</span>
                    <span style={{fontSize:13,color:"#374151",fontWeight:500}}>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis && !loading && (
            <div>
              {lines}
              <button onClick={()=>{setAnalysis(null);}} className="btn-hover" style={{width:"100%",marginTop:12,background:"#f3f4f6",border:"none",borderRadius:11,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",color:"#374151"}}>
                ↩ Relancer l'analyse
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ADD BET MODAL ────────────────────────────────────────────────
function AddBetModal({ match, user, onSave, onClose }) {
  const [pick, setPick] = useState(null); const [cote, setCote] = useState(""); const [mise, setMise] = useState(""); const [bm, setBm] = useState("Winamax");
  const opts = [{label:match.p1,cote:match.c1},...(match.cN?[{label:"Nul",cote:match.cN}]:[]),{label:match.p2,cote:match.c2}];
  const gain = ((parseFloat(mise)||0)*(parseFloat(cote)||0)).toFixed(2);
  const save = async () => {
    if(!pick||!mise) return;
    const bet = { id:Date.now().toString(), matchId:match.id, sport:match.sport, match:`${match.p1} vs ${match.p2}`, tournament:match.tournament, date:match.date, time:match.time, pick:pick.label, cote:parseFloat(cote)||pick.cote, mise:parseFloat(mise), bookmaker:bm, status:"pending", createdAt:new Date().toISOString(), gainPotentiel:gain };
    await saveBet(user.email, bet); onSave(bet);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>Enregistrer mon pari</div><div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{match.p1} vs {match.p2}</div><div style={{fontSize:12,color:C.gray,marginTop:2}}>{match.tournament} · {match.date}</div></div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Mon choix</div>
          <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
            {opts.map((o,i)=>(
              <div key={i} onClick={()=>{setPick(o);setCote(o.cote.toFixed(2));}} style={{flex:1,minWidth:70,textAlign:"center",background:pick?.label===o.label?C.lightGreen:"#f9fafb",border:`2px solid ${pick?.label===o.label?C.green:C.border}`,borderRadius:12,padding:"12px 6px",cursor:"pointer",transition:"all 0.15s"}}>
                <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:4}}>{o.label}</div>
                <div style={{fontSize:20,fontWeight:900,color:pick?.label===o.label?C.green:"#111827"}}>{o.cote.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            {[{l:"Cote retenue",v:cote,s:setCote,t:"number",p:"ex: 1.85"},{l:"Mise (€)",v:mise,s:setMise,t:"number",p:"ex: 20"}].map(f=>(
              <div key={f.l}><label style={{fontSize:12,fontWeight:700,color:C.gray,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.6}}>{f.l}</label><input type={f.t} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p} step="0.01" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 12px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}} /></div>
            ))}
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:7,textTransform:"uppercase",letterSpacing:0.6}}>Bookmaker</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {["Winamax","Betclic","Unibet","PMU","Autre"].map(b=>(
                <button key={b} onClick={()=>setBm(b)} style={{padding:"7px 14px",borderRadius:99,border:`1.5px solid ${bm===b?C.green:C.border}`,background:bm===b?C.lightGreen:"#fff",color:bm===b?C.green:"#374151",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          {pick&&mise&&cote&&(
            <div style={{background:C.lightGreen,border:`1.5px solid ${C.borderGreen}`,borderRadius:14,padding:"14px 18px",marginBottom:18}}>
              <div style={{fontSize:13,color:"#166534",fontWeight:700,marginBottom:4}}>Récapitulatif</div>
              <div style={{fontSize:15,fontWeight:900,color:"#111827"}}>{pick.label} @ {cote}</div>
              <div style={{fontSize:13,color:C.gray,marginTop:4}}>Mise : <strong style={{color:"#111827"}}>{mise}€</strong> · Gain potentiel : <strong style={{color:C.green}}>{gain}€</strong> · {bm}</div>
            </div>
          )}
          <button onClick={save} disabled={!pick||!mise} style={{width:"100%",background:(!pick||!mise)?"#e5e7eb":`linear-gradient(135deg,${C.green},#22c55e)`,color:(!pick||!mise)?"#9ca3af":"#fff",border:"none",borderRadius:12,padding:"13px 0",fontSize:15,fontWeight:800,cursor:(!pick||!mise)?"default":"pointer",fontFamily:"inherit"}}>
            ✅ Enregistrer ce pari
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ABONNEMENT : LOGIQUE D'ÉTAT ──────────────────────────────────
function getSubStatus(sub) {
  if (!sub) return { status: "none" };
  const now = new Date();
  // Support snake_case (Supabase) et camelCase (local)
  const trialEndsAt = sub.trial_ends_at || sub.trialEndsAt;
  const status = sub.status;

  if (status === "active") return { status: "active" };

  if (trialEndsAt) {
    const trialEnd = new Date(trialEndsAt);
    if (isNaN(trialEnd.getTime())) return { status: "none" };
    if (now < trialEnd) {
      const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000*60*60*24)));
      return { status: "trial", daysLeft };
    }
    return { status: "expired" };
  }

  if (status === "trial") return { status: "expired" };
  return { status: "none" };
}

// ─── NOTIFICATION DE RAPPEL (48h d'inactivité) ────────────────────
// ─── PROMPT INSTALLATION PWA ───────────────────────────────────────
function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(
    localStorage.getItem("pwa_dismissed") === "true"
  );

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setShown(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!shown || dismissed || !prompt) return null;

  const install = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShown(false);
    else { setDismissed(true); localStorage.setItem("pwa_dismissed", "true"); }
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa_dismissed", "true");
  };

  return (
    <div style={{background:"linear-gradient(135deg,#0f2d1a,#16a34a)",borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,boxShadow:"0 4px 16px rgba(22,163,74,0.3)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:28}}>📲</span>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>Installer BetTrust</div>
          <div style={{fontSize:11,color:"#bbf7d0"}}>Accès rapide depuis ton écran d'accueil</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={install} style={{background:"#fff",color:"#16a34a",border:"none",borderRadius:9,padding:"8px 14px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Installer</button>
        <button onClick={dismiss} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:9,padding:"8px 10px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
      </div>
    </div>
  );
}

function InactivityBanner({ lastSeenISO, onDismiss }) {
  if (!lastSeenISO) return null;
  const hours = (Date.now() - new Date(lastSeenISO).getTime()) / (1000*60*60);
  if (hours < 48) return null;
  return (
    <div style={{background:"linear-gradient(135deg,#fef9c3,#fef08a)",border:"1.5px solid #fde047",borderRadius:14,padding:"14px 18px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <div style={{fontWeight:800,color:"#854d0e",fontSize:14}}>⏰ Ça fait un moment !</div>
        <div style={{fontSize:13,color:"#854d0e"}}>De nouveaux matchs t'attendent. Viens voir les analyses du jour.</div>
      </div>
      <button onClick={onDismiss} style={{background:"#854d0e",color:"#fff",border:"none",borderRadius:9,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>
        C'est noté
      </button>
    </div>
  );
}

// ─── ÉCRAN ABONNEMENT ──────────────────────────────────────────────
function SubscriptionScreen({ user, sub, onActivateTrial, onSubscribed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState("monthly");
  const status = getSubStatus(sub);

  const startTrial = async () => {
    setLoading(true);
    // Anti-abus : vérifie si cet email a déjà eu un essai
    const alreadyUsed = await hasUsedTrial(user.email);
    if (alreadyUsed) {
      setError("Cet email a déjà bénéficié de l'essai gratuit. Abonne-toi pour continuer.");
      setLoading(false);
      return;
    }
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS*24*60*60*1000);
    const newSub = {
      status: "trial",
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnd.toISOString(),
    };
    const saved = await saveSubscription(user.email, newSub, user.token);
    if (saved) onActivateTrial(newSub);
    else setError("Erreur lors de l'activation. Réessaie.");
    setLoading(false);
  };

  const pay = async () => {
    setLoading(true); setError("");
    const amount = plan === "annual" ? PRICE_ANNUAL : PRICE_MONTHLY;
    const interval = plan === "annual" ? "year" : "month";
    const result = await createStripeCheckout(user, amount, interval);
    if (result.demo) {
      const newSub = { ...sub, status:"active", plan, paidAt: new Date().toISOString() };
      await saveSubscription(user.email, newSub);
      onSubscribed(newSub);
    } else if (result.ok && result.url) {
      window.location.href = result.url;
    } else {
      setError("Paiement indisponible pour le moment. Réessaie plus tard.");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:22,padding:"34px 28px",width:"100%",maxWidth:440,boxShadow:"0 8px 40px rgba(0,0,0,0.08)",textAlign:"center"}}>
        <div style={{margin:"0 auto 10px",width:"fit-content"}}><BetTrustLogo size={52} variant="dark" /></div>
        <div style={{fontSize:22,fontWeight:900,color:"#111827",marginBottom:4}}>
          {status.status==="expired" ? "Ton essai est terminé" : "Débloque BetTrust"}
        </div>
        <div style={{fontSize:13,color:C.gray,marginBottom:22,lineHeight:1.5}}>
          {status.status==="expired" ? "Continue à profiter de l'IA 360° et de ton historique de paris." : "L'IA au service de vos décisions."}
        </div>

        <div style={{background:C.lightGreen,border:`1.5px solid ${C.borderGreen}`,borderRadius:14,padding:"14px 18px",marginBottom:22,textAlign:"left"}}>
          {["🔍 Analyse IA 360° illimitée","📊 Historique & ROI personnel","⚡ Combiné intelligent du jour","👥 Fiches joueurs & compositions","⏱️ Analyse mi-temps live","🔔 Alertes quasi-certitude"].map((f,i)=>(
            <div key={i} style={{fontSize:13,color:"#166534",fontWeight:600,marginBottom:i<5?7:0}}>{f}</div>
          ))}
        </div>

        {/* SÉLECTEUR OFFRE */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {/* MENSUEL */}
          <div onClick={()=>setPlan("monthly")} style={{border:`2px solid ${plan==="monthly"?C.green:C.border}`,borderRadius:14,padding:"14px 10px",cursor:"pointer",background:plan==="monthly"?C.lightGreen:"#fff",transition:"all 0.15s"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gray,marginBottom:4}}>MENSUEL</div>
            <div style={{fontSize:22,fontWeight:900,color:plan==="monthly"?C.green:"#111827"}}>24,90€</div>
            <div style={{fontSize:11,color:C.gray}}>par mois</div>
          </div>
          {/* ANNUEL */}
          <div onClick={()=>setPlan("annual")} style={{border:`2px solid ${plan==="annual"?C.green:C.border}`,borderRadius:14,padding:"14px 10px",cursor:"pointer",background:plan==="annual"?C.lightGreen:"#fff",position:"relative",transition:"all 0.15s"}}>
            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:C.green,color:"#fff",fontSize:10,fontWeight:800,padding:"2px 10px",borderRadius:99,whiteSpace:"nowrap"}}>🎁 2 mois offerts</div>
            <div style={{fontSize:11,fontWeight:700,color:C.gray,marginBottom:4}}>ANNUEL</div>
            <div style={{fontSize:22,fontWeight:900,color:plan==="annual"?C.green:"#111827"}}>249€</div>
            <div style={{fontSize:11,color:C.gray}}>par an · ~{(PRICE_ANNUAL/12).toFixed(2)}€/mois</div>
          </div>
        </div>

        {error && <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:9,padding:"9px 12px",fontSize:13,color:"#dc2626",marginBottom:14,fontWeight:500}}>{error}</div>}

        {status.status === "none" && (
          <button onClick={startTrial} style={{width:"100%",background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:13,padding:"14px 0",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>
            Commencer les {TRIAL_DAYS} jours gratuits →
          </button>
        )}
        {status.status === "expired" && (
          <button onClick={pay} disabled={loading} style={{width:"100%",background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:13,padding:"14px 0",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>
            {loading ? "..." : plan==="annual" ? "S'abonner — 249€/an →" : "S'abonner — 24,90€/mois →"}
          </button>
        )}
        {status.status === "none" && (
          <div style={{fontSize:12,color:C.gray,marginBottom:10}}>Puis {plan==="annual"?"249€/an":"24,90€/mois"} après l'essai</div>
        )}
        <div style={{fontSize:11,color:"#9ca3af"}}>Paiement sécurisé par Stripe · Sans engagement · Résiliable à tout moment</div>
      </div>
    </div>
  );
}

function SubStatusBadge({ sub }) {
  const status = getSubStatus(sub);
  if (status.status === "trial") {
    return <span style={{fontSize:10,fontWeight:700,background:"#fffbeb",color:"#ca8a04",padding:"2px 8px",borderRadius:99,border:"1px solid #fde68a"}}>Essai · {status.daysLeft}j restants</span>;
  }
  if (status.status === "active") {
    return <span style={{fontSize:10,fontWeight:700,background:C.lightGreen,color:C.green,padding:"2px 8px",borderRadius:99,border:`1px solid ${C.borderGreen}`}}>✓ Abonné</span>;
  }
  return null;
}


// ─── BADGE & JAUGE PIÈGE / VALUE BET ──────────────────────────────
function EdgeBadge({ signal }) {
  if (signal.type === "neutral") return null;
  return (
    <>
      <style>{`
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 3px 10px ${signal.color}55, 0 0 0 0 ${signal.color}44; }
          50% { box-shadow: 0 3px 10px ${signal.color}55, 0 0 0 6px ${signal.color}00; }
        }
        @keyframes badgeIn {
          from { opacity:0; transform: translateY(-6px) scale(0.85); }
          to   { opacity:1; transform: translateY(0)    scale(1); }
        }
      `}</style>
      <div style={{
        position:"absolute", top:-9, left:14, zIndex:5,
        background: signal.color, color:"#fff",
        fontSize:11, fontWeight:800, padding:"4px 11px", borderRadius:99,
        display:"flex", alignItems:"center", gap:5,
        animation:"badgeIn 0.35s cubic-bezier(.34,1.56,.64,1) both, badgePulse 2.2s ease-in-out 0.5s infinite",
      }}>
        <span>{signal.icon}</span><span>{signal.label}</span>
      </div>
    </>
  );
}

function EdgeGauge({ signal, compact }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  if (signal.type === "neutral") return null;
  const marketPct = Math.round(signal.marketProb);
  const aiPct = Math.round(signal.aiProb);
  return (
    <div style={{ background: signal.bg, border:`1.5px solid ${signal.border}`, borderRadius:12, padding: compact ? "10px 12px" : "13px 15px", marginTop:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:700, color: signal.color }}>
          {signal.icon} {signal.type === "trap" ? "Le marché surestime ce favori" : "Le marché sous-estime cette chance"}
        </span>
        <span style={{ fontSize:11, fontWeight:800, color: signal.color }}>{signal.edge > 0 ? "+" : ""}{Math.round(signal.edge)} pts</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, color:"#6b7280", width:56, flexShrink:0, fontWeight:600 }}>Marché</span>
          <div style={{ flex:1, height:7, background:"#e5e7eb", borderRadius:99, overflow:"hidden" }}>
            <div style={{ width: animated ? `${marketPct}%` : "0%", height:"100%", background:"#9ca3af", borderRadius:99, transition:"width 0.7s cubic-bezier(.4,0,.2,1)" }} />
          </div>
          <span style={{ fontSize:10, color:"#6b7280", width:32, textAlign:"right", fontWeight:700 }}>{marketPct}%</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, color: signal.color, width:56, flexShrink:0, fontWeight:700 }}>IA BetTrust</span>
          <div style={{ flex:1, height:7, background:"#e5e7eb", borderRadius:99, overflow:"hidden" }}>
            <div style={{ width: animated ? `${aiPct}%` : "0%", height:"100%", background: signal.color, borderRadius:99, transition:"width 0.9s cubic-bezier(.4,0,.2,1) 0.15s" }} />
          </div>
          <span style={{ fontSize:10, color: signal.color, width:32, textAlign:"right", fontWeight:800 }}>{aiPct}%</span>
        </div>
      </div>
    </div>
  );
}


// ─── RADAR DU JOUR ─────────────────────────────────────────────────
// Calcule, sur l'ensemble tennis + football, les matchs avec un signal
// fort (piège ou value bet) et en retient les 2-3 plus marqués.
function computeRadarPicks(allMatches, maxPicks = 3) {
  const candidates = allMatches.map(match => {
    const opts = [{label:match.p1,cote:match.c1},...(match.cN?[{label:"Nul",cote:match.cN}]:[]),{label:match.p2,cote:match.c2}];
    const best = opts.reduce((a,b)=>a.cote<b.cote?a:b);
    const opponentCote = best.cote===match.c1 ? match.c2 : match.c1;
    const conf = defaultConfidenceFromOdds(best.cote, opponentCote);
    const signal = getEdgeSignal(best.cote, conf);
    return { match, signal, best };
  }).filter(c => c.signal.type !== "neutral");

  // Tri par force du signal (écart absolu le plus marqué en premier)
  candidates.sort((a, b) => Math.abs(b.signal.edge) - Math.abs(a.signal.edge));
  return candidates.slice(0, maxPicks);
}

// ─── COMBINÉ INTELLIGENT ───────────────────────────────────────────
// Construit toujours 3 sélections : priorité absolue aux value bets (💎),
// jamais de piège (🪤), complété par les meilleurs paris neutres (⚖️)
// uniquement si pas assez de value bets disponibles.
const SMART_COMBO_SIZE = 3;

function computeSmartCombo(allMatches) {
  const all = allMatches.map(match => {
    const opts = [{label:match.p1,cote:match.c1},...(match.cN?[{label:"Nul",cote:match.cN}]:[]),{label:match.p2,cote:match.c2}];
    const best = opts.reduce((a,b)=>a.cote<b.cote?a:b);
    const opponentCote = best.cote===match.c1 ? match.c2 : match.c1;
    const conf = defaultConfidenceFromOdds(best.cote, opponentCote);
    const signal = getEdgeSignal(best.cote, conf);
    return { match, signal, best };
  });

  const valueBets = all.filter(c => c.signal.type === "value").sort((a,b) => b.signal.edge - a.signal.edge);
  const neutrals = all.filter(c => c.signal.type === "neutral").sort((a,b) => b.signal.aiProb - a.signal.aiProb);
  // Les pièges (signal.type === "trap") sont volontairement exclus, toujours.

  const selections = [...valueBets];
  if (selections.length < SMART_COMBO_SIZE) {
    const needed = SMART_COMBO_SIZE - selections.length;
    selections.push(...neutrals.slice(0, needed));
  }
  const finalSelections = selections.slice(0, SMART_COMBO_SIZE);

  if (finalSelections.length === 0) return null;

  const totalCote = finalSelections.reduce((acc, s) => acc * s.best.cote, 1);
  // Probabilité globale réaliste : produit des probabilités IA estimées (pas des cotes brutes)
  const globalProb = finalSelections.reduce((acc, s) => acc * (s.signal.aiProb / 100), 1) * 100;
  const valueCount = finalSelections.filter(s => s.signal.type === "value").length;

  return { selections: finalSelections, totalCote, globalProb, valueCount };
}

function RadarBanner({ allMatches, onSelectMatch }) {
  const [expanded, setExpanded] = useState(true);
  if (!allMatches || allMatches.length === 0) return null;
  const picks = computeRadarPicks(allMatches, 3);
  if (picks.length === 0) return null;

  return (
    <div style={{ background:"linear-gradient(135deg,#0F3D2E,#16A34A)", borderRadius:18, padding:"18px 18px 16px", marginBottom:20, boxShadow:"0 6px 24px rgba(15,61,46,0.18)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={()=>setExpanded(e=>!e)}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18 }}>📡</span>
          <div>
            <div style={{ fontSize:14, fontWeight:900, color:"#fff" }}>Radar du jour</div>
            <div style={{ fontSize:11, color:"#bbf7d0" }}>{picks.length} signal{picks.length>1?"aux":""} fort{picks.length>1?"s":""} repéré{picks.length>1?"s":""} aujourd'hui</div>
          </div>
        </div>
        <span style={{ color:"#fff", fontSize:13, transform: expanded?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>

      {expanded && (
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:14 }}>
          {picks.map((p,i)=>(
            <div key={i} onClick={()=>onSelectMatch(p.match)} style={{ background:"rgba(255,255,255,0.96)", borderRadius:13, padding:"11px 14px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:800, color: p.signal.color, background:p.signal.bg, border:`1px solid ${p.signal.border}`, borderRadius:99, padding:"2px 8px" }}>
                    {p.signal.icon} {p.signal.label}
                  </span>
                  <span style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{p.match.p1.length+p.match.p2.length > 24 ? "" : (p.match.sport==="tennis"?"🎾":"⚽")}</span>
                </div>
                <div style={{ fontSize:13, fontWeight:800, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {p.match.p1} <span style={{ color:"#d1d5db", fontWeight:400 }}>vs</span> {p.match.p2}
                </div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>{p.match.tournament} · {p.match.time}</div>
              </div>
              <span style={{ fontSize:12, color:"#16a34a", fontWeight:800, flexShrink:0 }}>Voir →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COMBINÉ INTELLIGENT — PANEL ────────────────────────────────────

// ─── FICHE JOUEUR PRÉ-MATCH — PANEL ───────────────────────────────
function LineupPanel({ match, onClose }) {
  const [lineup, setLineup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeTeam, setActiveTeam] = useState("team1");

  const run = async () => {
    setLoading(true);
    try { setLineup(await analyzeLineup(match)); }
    catch(e) { setLineup(null); }
    setLoading(false);
  };

  // Composant terrain tactique SVG
  const TacticalField = ({ teamData, side }) => {
    if (!teamData?.players?.length) return null;
    const positions = getPlayerPositions(teamData.players, side);

    return (
      <div style={{position:"relative",width:"100%",aspectRatio:"2/3",borderRadius:12,overflow:"hidden",background:"#2d6a2d"}}>
        {/* Terrain SVG */}
        <svg width="100%" height="100%" viewBox="0 0 100 150" preserveAspectRatio="none" style={{position:"absolute",inset:0}}>
          {/* Fond */}
          <rect width="100" height="150" fill="#2d6a2d"/>
          {/* Bandes de tonte */}
          {[0,1,2,3,4,5,6,7,8,9].map(i=>(
            <rect key={i} x="0" y={i*15} width="100" height="15" fill={i%2===0?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.03)"}/>
          ))}
          {/* Lignes */}
          <rect x="5" y="5" width="90" height="140" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"/>
          <line x1="5" y1="75" x2="95" y2="75" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"/>
          <circle cx="50" cy="75" r="12" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.7"/>
          <circle cx="50" cy="75" r="1" fill="rgba(255,255,255,0.8)"/>
          {/* Surface haut */}
          <rect x="22" y="5" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6"/>
          <rect x="36" y="5" width="28" height="9" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
          <circle cx="50" cy="17" r="1" fill="rgba(255,255,255,0.6)"/>
          {/* Surface bas */}
          <rect x="22" y="125" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6"/>
          <rect x="36" y="136" width="28" height="9" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
          <circle cx="50" cy="133" r="1" fill="rgba(255,255,255,0.6)"/>
          {/* Buts */}
          <rect x="38" y="2" width="24" height="5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6"/>
          <rect x="38" y="143" width="24" height="5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6"/>
        </svg>

        {/* Joueurs */}
        {teamData.players.map((player, i) => {
          const pos = positions[player.name];
          if (!pos) return null;
          const isSelected = selectedPlayer?.name === player.name;
          const hasAlert = player.alert || player.butPct > 70 || player.passePct > 70;
          const teamColor = teamData.color || "#1a56db";

          return (
            <div
              key={i}
              onClick={() => setSelectedPlayer(isSelected ? null : player)}
              style={{
                position:"absolute",
                left:`${pos.x}%`,
                top:`${pos.y}%`,
                transform:"translate(-50%,-50%)",
                display:"flex",
                flexDirection:"column",
                alignItems:"center",
                gap:2,
                cursor:"pointer",
                zIndex:10,
              }}
            >
              {/* Badge alerte */}
              {hasAlert && (
                <div style={{position:"absolute",top:-8,right:-4,width:12,height:12,background:"#dc2626",borderRadius:"50%",border:"1.5px solid #fff",fontSize:7,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,zIndex:11}}>!</div>
              )}
              {/* Cercle joueur */}
              <div style={{
                width:isSelected?34:28,
                height:isSelected?34:28,
                borderRadius:"50%",
                background:isSelected?"#fff":teamColor,
                border:isSelected?`3px solid ${teamColor}`:"2.5px solid rgba(255,255,255,0.9)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                fontSize:isSelected?11:9,
                fontWeight:900,
                color:isSelected?teamColor:"#fff",
                boxShadow:isSelected?"0 0 12px rgba(255,255,255,0.8)":"0 2px 6px rgba(0,0,0,0.3)",
                transition:"all 0.2s ease",
              }}>
                {player.number || player.name.split(" ").pop().slice(0,3).toUpperCase()}
              </div>
              {/* Nom */}
              <div style={{
                fontSize:7,
                fontWeight:700,
                color:"#fff",
                textShadow:"0 1px 3px rgba(0,0,0,0.8)",
                whiteSpace:"nowrap",
                maxWidth:45,
                overflow:"hidden",
                textOverflow:"ellipsis",
                textAlign:"center",
                background:"rgba(0,0,0,0.35)",
                borderRadius:4,
                padding:"1px 3px",
              }}>
                {player.name.split(" ").pop()}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Panel joueur cliqué
  const PlayerCard = ({ player, teamColor }) => {
    if (!player) return null;
    const butCol = player.butPct >= 70 ? "#dc2626" : player.butPct >= 50 ? "#ca8a04" : C.green;
    const passeCol = player.passePct >= 70 ? "#dc2626" : player.passePct >= 50 ? "#ca8a04" : C.green;

    return (
      <div style={{background:"#fff",borderRadius:16,padding:"16px",marginTop:12,border:`2px solid ${teamColor||C.green}`}} className="anim-scalein">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{player.name}</div>
            <div style={{fontSize:12,color:C.gray,marginTop:2}}>{player.position} {player.number ? `· N°${player.number}` : ""}</div>
          </div>
          {player.alert && <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:800,color:"#dc2626"}}>🚨 Signal fort</div>}
        </div>

        {/* Stats */}
        <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:12,color:"#374151",lineHeight:1.7}}>
          {player.stats && <div style={{fontWeight:600}}>{player.stats}</div>}
          {player.form && <div style={{color:"#4b5563",marginTop:4}}>{player.form}</div>}
          {player.physical && <div style={{color:"#6b7280",fontSize:11,marginTop:2}}>💪 {player.physical}</div>}
          {player.perso && player.perso !== "RAS" && <div style={{color:"#6b7280",fontSize:11,marginTop:2}}>📱 {player.perso}</div>}
        </div>

        {/* Probabilités */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:player.butPct>=70?"#fef2f2":C.lightGreen,borderRadius:10,padding:"10px",textAlign:"center",border:`1.5px solid ${player.butPct>=70?"#fca5a5":C.borderGreen}`}}>
            <div style={{fontSize:22,fontWeight:900,color:butCol}}>{player.butPct}%</div>
            <div style={{fontSize:10,color:C.gray,fontWeight:600,marginTop:2}}>🎯 But</div>
            <div style={{height:4,background:"#e5e7eb",borderRadius:99,marginTop:6,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${player.butPct}%`,background:butCol,borderRadius:99}}/>
            </div>
          </div>
          <div style={{background:player.passePct>=70?"#fef2f2":C.lightGreen,borderRadius:10,padding:"10px",textAlign:"center",border:`1.5px solid ${player.passePct>=70?"#fca5a5":C.borderGreen}`}}>
            <div style={{fontSize:22,fontWeight:900,color:passeCol}}>{player.passePct}%</div>
            <div style={{fontSize:10,color:C.gray,fontWeight:600,marginTop:2}}>🅰️ Passe décisive</div>
            <div style={{height:4,background:"#e5e7eb",borderRadius:99,marginTop:6,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${player.passePct}%`,background:passeCol,borderRadius:99}}/>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const currentTeam = lineup?.[activeTeam];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f8fafb",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">

        {/* Header */}
        <div style={{background:"#fff",padding:"16px 20px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,color:C.gray,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>⚽ Compositions tactiques</div>
            <div style={{fontSize:15,fontWeight:900,color:"#111827"}}>{match.p1} <span style={{color:C.gray,fontWeight:400}}>vs</span> {match.p2}</div>
            <div style={{fontSize:11,color:C.gray}}>{match.tournament} · {match.date}</div>
          </div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:34,height:34,fontSize:16,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{overflowY:"auto",flex:1,padding:"16px 18px"}}>
          {!lineup && !loading && (
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{fontSize:48,marginBottom:16}} className="anim-float">⚽</div>
              <div style={{fontSize:18,fontWeight:900,color:"#111827",marginBottom:8}}>Compositions tactiques</div>
              <div style={{fontSize:13,color:C.gray,marginBottom:24,lineHeight:1.7}}>Formation officielle · Joueurs positionnés sur le terrain · Stats individuelles · Pourcentages But & Passe</div>
              <button onClick={run} className="btn-hover" style={{background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:14,padding:"14px 36px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                Charger les compositions →
              </button>
            </div>
          )}

          {loading && (
            <div style={{textAlign:"center",padding:"36px 0"}}>
              <style>{`@keyframes fieldPulse{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>
              <div style={{fontSize:52,marginBottom:16,display:"inline-block",animation:"fieldPulse 1.5s ease infinite"}}>🔍</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:12}}>Recherche des compositions...</div>
              {["Détection de la formation","Recherche des titulaires","Analyse des stats individuelles","Calcul des probabilités"].map((s,i)=>(
                <div key={i} style={{fontSize:13,color:C.gray,padding:"4px 0",animation:`stepFade 2s ease ${i*0.3}s infinite`}}>· {s}</div>
              ))}
            </div>
          )}

          {lineup && !loading && (
            <div>
              {/* Sélecteur équipe */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {["team1","team2"].map(t => (
                  <button key={t} onClick={()=>{setActiveTeam(t);setSelectedPlayer(null);}} style={{
                    flex:1,padding:"10px 8px",borderRadius:11,border:`2px solid ${activeTeam===t?(lineup[t]?.color||C.green):C.border}`,
                    background:activeTeam===t?(lineup[t]?.color||C.green)+"15":"#fff",
                    color:activeTeam===t?(lineup[t]?.color||C.green):"#374151",
                    fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",
                    transition:"all 0.2s",
                  }}>
                    {lineup[t]?.name || (t==="team1"?match.p1:match.p2)}
                    {lineup[t]?.formation && <span style={{fontSize:10,fontWeight:600,marginLeft:6,opacity:0.7}}>{lineup[t].formation}</span>}
                  </button>
                ))}
              </div>

              {/* Terrain tactique */}
              {currentTeam && (
                <TacticalField
                  teamData={currentTeam}
                  side={activeTeam==="team1"?"top":"bottom"}
                />
              )}

              {/* Fiche joueur cliqué */}
              {selectedPlayer && (
                <PlayerCard
                  player={selectedPlayer}
                  teamColor={currentTeam?.color}
                />
              )}

              {!selectedPlayer && (
                <div style={{textAlign:"center",padding:"12px 0",fontSize:12,color:C.gray}}>
                  Appuie sur un joueur pour voir son analyse individuelle
                </div>
              )}

              {/* Joueurs en alerte */}
              {currentTeam?.players?.filter(p=>p.alert||p.butPct>70||p.passePct>70).length > 0 && (
                <div style={{marginTop:12,background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#dc2626",marginBottom:8}}>🚨 Signaux forts détectés</div>
                  {currentTeam.players.filter(p=>p.alert||p.butPct>70||p.passePct>70).map((p,i)=>(
                    <div key={i} onClick={()=>setSelectedPlayer(p)} style={{fontSize:13,color:"#374151",fontWeight:600,padding:"4px 0",cursor:"pointer",display:"flex",justifyContent:"space-between"}}>
                      <span>{p.name}</span>
                      <span style={{color:"#dc2626",fontWeight:800}}>
                        {p.butPct>70?`But ${p.butPct}%`:""} {p.passePct>70?`Passe ${p.passePct}%`:""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



// ─── ANALYSE MI-TEMPS — PANEL ──────────────────────────────────────
function HalftimePanel({ match, onClose }) {
  const [score, setScore] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("input"); // "input" | "result"
  const hasAlert = analysis && analysis.includes("ALERTE PARI");

  const run = async () => {
    if (!score.trim()) return;
    setLoading(true); setStep("result");
    try { setAnalysis(await analyzeHalftime(match, score)); }
    catch(e) { setAnalysis("Erreur réseau. Réessaie."); }
    setLoading(false);
  };

  const formatHalftime = (text) => text.split("\n").map((l, i) => {
    if (l.startsWith("📊")) return <div key={i} style={{fontSize:14,fontWeight:900,color:"#111827",marginTop:10,marginBottom:6}}>{l}</div>;
    if (l.startsWith("⚡")) return <div key={i} style={{fontSize:13,fontWeight:800,color:C.green,marginBottom:4}}>{l}</div>;
    if (l.startsWith("🩹")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#dc2626",background:"#fef2f2",borderRadius:8,padding:"6px 10px",marginBottom:6}}>{l}</div>;
    if (l.startsWith("🎯")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginTop:10,marginBottom:4}}>{l}</div>;
    if (l.startsWith("🔔 SIGNAL")) {
      const isAlert = l.includes("ALERTE PARI");
      return <div key={i} style={{fontSize:14,fontWeight:900,color:isAlert?"#dc2626":C.gray,background:isAlert?"#fef2f2":"#f9fafb",border:`2px solid ${isAlert?"#fca5a5":C.border}`,borderRadius:12,padding:"10px 13px",marginTop:12,marginBottom:6}}>{l}</div>;
    }
    if (l.startsWith("💰")) return <div key={i} style={{fontSize:14,fontWeight:800,color:"#0ea5e9",background:"#f0f9ff",borderRadius:9,padding:"10px 13px",marginBottom:8}}>{l}</div>;
    if (l.startsWith("---")) return <hr key={i} style={{border:"none",borderTop:"1px solid #e5e7eb",margin:"8px 0"}}/>;
    if (!l.trim()) return <div key={i} style={{height:4}}/>;
    return <div key={i} style={{fontSize:13,color:"#4b5563",lineHeight:1.6}}>{l}</div>;
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>⏱️ Analyse mi-temps live</div>
            <div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{match.p1} vs {match.p2}</div>
          </div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
          {step==="input"&&(
            <div>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{fontSize:40,marginBottom:10}}>⏱️</div>
                <div style={{fontSize:16,fontWeight:900,color:"#111827",marginBottom:6}}>Mi-temps atteinte</div>
                <div style={{fontSize:13,color:C.gray,lineHeight:1.5}}>Entre le score actuel — l'IA analyse les stats de 1ère mi-temps et te dit si un pari de 2ème mi-temps vaut le coup.</div>
              </div>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Score à la mi-temps</div>
                <input value={score} onChange={e=>setScore(e.target.value)} placeholder={`ex: ${match.p1} 1 - 0 ${match.p2}`}
                  style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"13px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}} />
              </div>
              {hasAlert&&(
                <div style={{background:"#fef2f2",border:"2px solid #fca5a5",borderRadius:12,padding:"12px 15px",marginBottom:16,fontSize:13,color:"#dc2626",fontWeight:700}}>
                  🔔 Signal détecté lors de la dernière analyse — pense à vérifier l'alerte ci-dessous.
                </div>
              )}
              <button onClick={run} disabled={!score.trim()} style={{width:"100%",background:score.trim()?`linear-gradient(135deg,${C.green},#22c55e)`:"#e5e7eb",color:score.trim()?"#fff":"#9ca3af",border:"none",borderRadius:12,padding:"13px 0",fontSize:15,fontWeight:800,cursor:score.trim()?"pointer":"default",fontFamily:"inherit"}}>
                Analyser la mi-temps →
              </button>
            </div>
          )}
          {step==="result"&&loading&&(
            <div style={{textAlign:"center",padding:"36px 0"}}>
              <div style={{fontSize:34,marginBottom:16}}>🔍</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:8}}>Analyse en cours...</div>
              <div style={{fontSize:13,color:C.gray,lineHeight:1.9}}>Recherche des stats de 1ère mi-temps<br/>Tirs · Passes · Zones attaquées<br/>Risques physiques & blessures<br/>Calcul du signal 2ème mi-temps</div>
            </div>
          )}
          {step==="result"&&!loading&&analysis&&(
            <div>
              {hasAlert&&(
                <div style={{background:"linear-gradient(135deg,#dc2626,#ef4444)",borderRadius:14,padding:"14px 18px",marginBottom:16,color:"#fff"}}>
                  <div style={{fontSize:14,fontWeight:900,marginBottom:4}}>🔔 ALERTE PARI 2ÈME MI-TEMPS</div>
                  <div style={{fontSize:12,opacity:0.9}}>L'IA a détecté un signal fort. Consulte la recommandation ci-dessous.</div>
                </div>
              )}
              {formatHalftime(analysis)}
              <button onClick={()=>{setStep("input");setAnalysis(null);}} style={{width:"100%",marginTop:16,background:"#f3f4f6",border:"none",borderRadius:10,padding:"10px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",color:"#374151"}}>
                ← Nouvelle analyse
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SmartComboPanel({ allMatches, onClose, onAddToBets }) {
  const combo = computeSmartCombo(allMatches);

  if (!combo) {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div style={{background:"#fff",borderRadius:20,padding:"32px 26px",maxWidth:380,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:38,marginBottom:12}}>🤷</div>
          <div style={{fontSize:16,fontWeight:800,color:"#111827",marginBottom:8}}>Pas de combiné aujourd'hui</div>
          <div style={{fontSize:13,color:C.gray,marginBottom:20,lineHeight:1.5}}>Aucun match disponible pour construire une sélection fiable pour le moment.</div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:10,padding:"10px 24px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
        </div>
      </div>
    );
  }

  const probColor = combo.globalProb >= 35 ? C.green : combo.globalProb >= 20 ? "#ca8a04" : "#dc2626";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">

        <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>🧠 Combiné intelligent</div>
            <div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{combo.selections.length} sélections · {combo.valueCount} value bet{combo.valueCount>1?"s":""}</div>
          </div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
          <div style={{background:`${probColor}15`,border:`2px solid ${probColor}55`,borderRadius:16,padding:"18px 20px",marginBottom:18,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.gray,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Probabilité globale estimée</div>
            <div style={{fontSize:40,fontWeight:900,color:probColor}}>{combo.globalProb.toFixed(0)}%</div>
            <div style={{fontSize:13,color:C.gray,marginTop:4}}>Cote totale : <strong style={{color:"#111827"}}>{combo.totalCote.toFixed(2)}</strong></div>
            <div style={{fontSize:11,color:C.gray,marginTop:8,lineHeight:1.5}}>Calculée à partir de nos estimations IA — une probabilité réaliste, pas une promesse.</div>
          </div>

          <div style={{fontSize:12,fontWeight:800,color:"#111827",marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>Les 3 sélections</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:8}}>
            {combo.selections.map((s,i)=>(
              <div key={i} style={{background:"#f9fafb",border:`1.5px solid ${s.signal.type==="value"?s.signal.border:C.border}`,borderRadius:13,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                      {s.signal.type!=="neutral"&&(
                        <span style={{fontSize:10,fontWeight:800,color:s.signal.color,background:s.signal.bg,border:`1px solid ${s.signal.border}`,borderRadius:99,padding:"2px 8px"}}>{s.signal.icon} {s.signal.label}</span>
                      )}
                      <span style={{fontSize:10,color:C.gray,fontWeight:600}}>{s.match.sport==="tennis"?"🎾":"⚽"} {s.match.tournament}</span>
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:"#111827"}}>{s.match.p1} <span style={{color:"#d1d5db",fontWeight:400}}>vs</span> {s.match.p2}</div>
                    <div style={{fontSize:12,color:C.green,fontWeight:700,marginTop:3}}>→ Miser sur : {s.best.label}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                    <div style={{fontSize:18,fontWeight:900,color:"#111827"}}>{s.best.cote.toFixed(2)}</div>
                    <div style={{fontSize:10,color:C.gray}}>cote</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:"16px 22px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>onAddToBets(combo)} style={{width:"100%",background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:13,padding:"14px 0",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
            ✅ Enregistrer ce combiné dans mes paris
          </button>
        </div>
      </div>
    </div>
  );
}




function DebriefPanel({ bet, onClose }) {
  const [debrief, setDebrief] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try { setDebrief(await debriefMatch(bet)); }
    catch(e) { setDebrief("Erreur réseau. Réessaie."); }
    setLoading(false);
  };

  const lines = (debrief||"").split("\n").map((l,i)=>{
    if(l.startsWith("🔁")) return <div key={i} style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:8,lineHeight:1.5}}>{l}</div>;
    if(l.startsWith("✅")) {
      const isGood = l.includes("Bonne décision");
      const isBad = l.includes("Mauvaise décision");
      const col = isGood ? C.green : isBad ? "#dc2626" : "#ca8a04";
      const bg = isGood ? C.lightGreen : isBad ? "#fef2f2" : "#fffbeb";
      const bord = isGood ? C.borderGreen : isBad ? "#fca5a5" : "#fde68a";
      return <div key={i} style={{fontSize:13,fontWeight:700,color:col,background:bg,border:`1.5px solid ${bord}`,borderRadius:9,padding:"9px 12px",marginBottom:10}}>{l}</div>;
    }
    if(l.startsWith("🎲")) return <div key={i} style={{fontSize:13,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",border:"1.5px solid #ddd6fe",borderRadius:9,padding:"9px 12px",marginBottom:10}}>{l}</div>;
    if(l.startsWith("📚")) return <div key={i} style={{fontSize:13,fontWeight:700,color:"#0ea5e9",background:"#f0f9ff",borderRadius:9,padding:"10px 13px",marginTop:4}}>{l}</div>;
    if(l.startsWith("---")) return <hr key={i} style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"8px 0"}}/>;
    if(!l.trim()) return <div key={i} style={{height:4}}/>;
    return <div key={i} style={{fontSize:13,color:"#4b5563",lineHeight:1.6}}>{l}</div>;
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>🧠 Debrief BetTrust</div>
            <div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{bet.match}</div>
            <div style={{fontSize:12,color:C.gray,marginTop:2}}>{bet.pick} @ {bet.cote} · {bet.status==="won"?"✅ Marqué passé":"❌ Marqué raté"}</div>
          </div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
          {!debrief&&!loading&&(
            <div style={{textAlign:"center",padding:"28px 0"}}>
              <div style={{fontSize:44,marginBottom:14}}>🧠</div>
              <div style={{fontSize:17,fontWeight:900,color:"#111827",marginBottom:8}}>Comprendre ce pari</div>
              <div style={{fontSize:13,color:C.gray,marginBottom:22,lineHeight:1.6}}>L'IA va analyser ce qui s'est vraiment passé et te dire si c'était une bonne décision, indépendamment du résultat.</div>
              <button onClick={run} style={{background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:12,padding:"12px 32px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Lancer le debrief →</button>
            </div>
          )}
          {loading&&(
            <div style={{textAlign:"center",padding:"36px 0"}}>
              <div style={{fontSize:34,marginBottom:16}}>🔍</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:8}}>Analyse en cours...</div>
              <div style={{fontSize:13,color:C.gray,lineHeight:1.9}}>Recherche du résultat réel<br/>Comparaison avec l'analyse initiale<br/>Identification de la leçon à retenir</div>
            </div>
          )}
          {debrief&&!loading&&<div>{lines}</div>}
        </div>
      </div>
    </div>
  );
}



// ─── COACH PERSONNEL — PANEL ───────────────────────────────────────

// ─── SCANNER DE COTE ───────────────────────────────────────────────
const SCANNER_PROMPT = `Tu es l'analyste value bet de BetTrust. Un parieur te soumet une cote qu'il a trouvée sur un site de paris. Ton rôle : analyser en 30 secondes si cette cote représente une vraie valeur ou un piège.

MÉTHODE :
1. Convertis la cote en probabilité implicite du marché (1/cote × 100)
2. Recherche les informations sur ce match/événement
3. Estime ta propre probabilité réelle basée sur les données disponibles
4. Calcule l'écart entre les deux
5. Donne un verdict immédiat et sans ambiguïté

SEUILS :
- Probabilité réelle estimée > probabilité marché + 8% : 💎 VALUE BET — prends-le
- Probabilité réelle estimée < probabilité marché - 8% : 🪤 PIÈGE — fuis
- Écart < 8% dans les deux sens : ⚖️ COTE JUSTE — neutre

FORMAT STRICT :
---
📊 DÉCODAGE :
Cote : [X.XX] → Probabilité marché : [XX]%
Probabilité réelle estimée : [XX]%
Écart : [+/-XX]%

🎯 VERDICT : [💎 VALUE BET / 🪤 PIÈGE / ⚖️ COTE JUSTE]
Confiance : X/10

💡 POURQUOI EN 3 LIGNES :
[Explication directe basée sur les données réelles]

💰 DÉCISION : [Jouer / Ne pas jouer / Attendre plus d'infos]
---`;

async function scanCote(cote, description, sport) {
  const probMarche = ((1 / parseFloat(cote)) * 100).toFixed(1);
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Analyse cette cote rapidement : ${cote} sur "${description}" (${sport}). Probabilité implicite du marché : ${probMarche}%. Cherche les infos sur cet événement et dis-moi si c'est une value bet, un piège ou une cote juste. Verdict rapide et tranché.` }],
      system: SCANNER_PROMPT,
      max_tokens: 600,
      useWebSearch: true,
    })
  });
  const data = await res.json();
  return data.text || "Analyse indisponible.";
}

function ScannerPanel({ onClose }) {
  const [cote, setCote] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState("football");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const probMarche = cote ? ((1 / parseFloat(cote)) * 100).toFixed(1) : null;

  const scan = async () => {
    if (!cote || !description) { setError("Remplis la cote et le pari."); return; }
    if (isNaN(parseFloat(cote)) || parseFloat(cote) < 1.01) { setError("Cote invalide (minimum 1.01)"); return; }
    setError(""); setLoading(true); setResult(null);
    try { setResult(await scanCote(cote, description, sport)); }
    catch(e) { setResult("Erreur réseau. Réessaie."); }
    setLoading(false);
  };

  const formatResult = (text) => text.split("\n").map((l, i) => {
    if (l.startsWith("📊")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#374151",marginTop:10,marginBottom:4}}>{l}</div>;
    if (l.startsWith("🎯 VERDICT")) {
      const isValue = l.includes("VALUE");
      const isPiege = l.includes("PIÈGE");
      const col = isValue ? C.green : isPiege ? "#dc2626" : "#ca8a04";
      const bg = isValue ? C.lightGreen : isPiege ? "#fef2f2" : "#fffbeb";
      const bord = isValue ? C.borderGreen : isPiege ? "#fca5a5" : "#fde68a";
      return <div key={i} style={{fontSize:16,fontWeight:900,color:col,background:bg,border:`2px solid ${bord}`,borderRadius:13,padding:"12px 16px",marginTop:12,marginBottom:8}}>{l}</div>;
    }
    if (l.startsWith("Confiance")) return <div key={i} style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:8}}>{l}</div>;
    if (l.startsWith("💡")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#374151",marginTop:10,marginBottom:4}}>{l}</div>;
    if (l.startsWith("💰 DÉCISION")) {
      const jouer = l.includes("Jouer") && !l.includes("Ne pas");
      return <div key={i} style={{fontSize:14,fontWeight:800,color:jouer?C.green:"#dc2626",background:jouer?C.lightGreen:"#fef2f2",borderRadius:10,padding:"10px 14px",marginTop:10}}>{l}</div>;
    }
    if (l.startsWith("Cote :") || l.startsWith("Probabilité") || l.startsWith("Écart")) return <div key={i} style={{fontSize:13,color:"#374151",lineHeight:1.6,fontFamily:"monospace"}}>{l}</div>;
    if (l.startsWith("---")) return <hr key={i} style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"8px 0"}}/>;
    if (!l.trim()) return <div key={i} style={{height:4}}/>;
    return <div key={i} style={{fontSize:13,color:"#4b5563",lineHeight:1.6}}>{l}</div>;
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#111827,#374151)",padding:"18px 22px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>🔎 Scanner de cote</div>
            <div style={{fontSize:17,fontWeight:900,color:"#fff"}}>Value ou Piège ?</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>Entre n'importe quelle cote — verdict en 10 secondes</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer",color:"#fff"}}>✕</button>
        </div>

        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
          {/* Sport selector */}
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{k:"football",l:"⚽ Football"},{k:"tennis",l:"🎾 Tennis"},{k:"autre",l:"🏅 Autre"}].map(s=>(
              <button key={s.k} onClick={()=>setSport(s.k)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1.5px solid ${sport===s.k?C.green:C.border}`,background:sport===s.k?C.lightGreen:"#fff",color:sport===s.k?C.green:"#374151",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                {s.l}
              </button>
            ))}
          </div>

          {/* Cote input */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>La cote que tu as trouvée</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input
                value={cote}
                onChange={e=>setCote(e.target.value)}
                placeholder="ex: 2.40"
                type="number"
                step="0.01"
                min="1.01"
                style={{flex:1,border:`2px solid ${cote?C.green:C.border}`,borderRadius:12,padding:"14px 16px",fontSize:22,fontWeight:900,outline:"none",fontFamily:"inherit",color:"#111827",textAlign:"center"}}
              />
              {probMarche && (
                <div style={{textAlign:"center",minWidth:80}}>
                  <div style={{fontSize:11,color:C.gray,marginBottom:2}}>Prob. marché</div>
                  <div style={{fontSize:20,fontWeight:900,color:"#111827"}}>{probMarche}%</div>
                </div>
              )}
            </div>
          </div>

          {/* Description input */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Décris le pari</div>
            <input
              value={description}
              onChange={e=>setDescription(e.target.value)}
              placeholder="ex: PSG gagne contre Lyon / Alcaraz vainqueur"
              style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:11,padding:"12px 14px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",color:"#111827"}}
            />
          </div>

          {error && <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:9,padding:"8px 12px",fontSize:13,color:"#dc2626",marginBottom:12,fontWeight:500}}>{error}</div>}

          {/* Scan button */}
          {!loading && !result && (
            <button onClick={scan} disabled={!cote||!description} style={{width:"100%",background:(!cote||!description)?"#e5e7eb":`linear-gradient(135deg,#111827,#374151)`,color:(!cote||!description)?"#9ca3af":"#fff",border:"none",borderRadius:13,padding:"14px 0",fontSize:15,fontWeight:800,cursor:(!cote||!description)?"default":"pointer",fontFamily:"inherit"}}>
              🔎 Scanner cette cote →
            </button>
          )}

          {/* Loading */}
          {loading && (
            <div style={{textAlign:"center",padding:"28px 0"}}>
              <style>{`@keyframes scanPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }`}</style>
              <div style={{fontSize:44,marginBottom:12,display:"inline-block",animation:"scanPulse 0.8s ease-in-out infinite"}}>🔎</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:6}}>Analyse en cours...</div>
              <div style={{fontSize:13,color:C.gray}}>Calcul probabilité marché → Recherche données → Verdict</div>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div>
              <div>{formatResult(result)}</div>
              <button onClick={()=>{setResult(null);setCote("");setDescription("");}} style={{width:"100%",marginTop:16,background:"#f3f4f6",border:"none",borderRadius:10,padding:"10px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",color:"#374151"}}>
                ← Scanner une autre cote
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachPanel({ user, bets, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const stats = computeCoachStats(bets);
  const done = bets.filter(b => b.status !== "pending");
  const winRate = done.length > 0 ? ((bets.filter(b=>b.status==="won").length / Math.max(done.length,1))*100).toFixed(0) : 0;
  const coachName = user.coachName || generateCoachName(user.email);

  const run = async () => {
    setLoading(true);
    try { setAnalysis(await analyzeCoach(bets, user.name, user.coachName || generateCoachName(user.email))); }
    catch(e) { setAnalysis("Erreur réseau. Réessaie."); }
    setLoading(false);
  };

  const formatCoach = (text) => text.split("\n").map((l, i) => {
    if (l.startsWith("👤")) return <div key={i} style={{fontSize:15,fontWeight:900,color:"#111827",background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:12,padding:"12px 15px",marginBottom:14,lineHeight:1.4}}>{l}</div>;
    if (l.startsWith("📊")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#374151",marginTop:14,marginBottom:6}}>{l}</div>;
    if (l.startsWith("💪")) return <div key={i} style={{fontSize:13,fontWeight:800,color:C.green,marginTop:14,marginBottom:6}}>{l}</div>;
    if (l.startsWith("⚠️")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#dc2626",marginTop:14,marginBottom:6}}>{l}</div>;
    if (l.startsWith("🎯")) return <div key={i} style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginTop:14,marginBottom:6}}>{l}</div>;
    if (l.startsWith("🔮")) return <div key={i} style={{fontSize:13,fontWeight:700,color:"#0ea5e9",background:"#f0f9ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"10px 13px",marginTop:14}}>{l}</div>;
    if (l.match(/^\d\./)) return <div key={i} style={{fontSize:13,color:"#374151",fontWeight:600,padding:"6px 10px",background:"#f9fafb",borderRadius:8,marginBottom:4,lineHeight:1.5}}>{l}</div>;
    if (l.startsWith("---")) return <hr key={i} style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"8px 0"}}/>;
    if (!l.trim()) return <div key={i} style={{height:4}}/>;
    return <div key={i} style={{fontSize:13,color:"#4b5563",lineHeight:1.6}}>{l}</div>;
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column"}} className="panel-slidein">
        <div style={{background:"linear-gradient(135deg,#0f2d1a,#16a34a)",padding:"20px 22px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#86efac",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>🏆 Ton coach personnel</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff",letterSpacing:-0.3}}>{coachName}</div>
            <div style={{fontSize:12,color:"#bbf7d0",marginTop:2}}>Coach attitré de {user.name} · {bets.length} paris analysés</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:99,width:32,height:32,fontSize:17,cursor:"pointer",color:"#fff"}}>✕</button>
        </div>

        <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>

          {/* Mini dashboard stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:18}}>
            {[
              {l:"Paris joués", v:done.length, col:"#111827"},
              {l:"Taux de réussite", v:`${winRate}%`, col:parseFloat(winRate)>=50?C.green:"#dc2626"},
              {l:"ROI", v:`${stats.roi}%`, col:parseFloat(stats.roi)>=0?C.green:"#dc2626"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#f9fafb",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:900,color:s.col}}>{s.v}</div>
                <div style={{fontSize:10,color:C.gray,fontWeight:600,marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Détails stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
            {[
              {l:"Sport dominant", v:stats.topSport==="tennis"?"🎾 Tennis":"⚽ Football"},
              {l:"Bookmaker préféré", v:stats.topBook},
              {l:"Cote moyenne jouée", v:stats.avgCote},
              {l:"Mise totale engagée", v:`${stats.totalMise}€`},
            ].map((s,i)=>(
              <div key={i} style={{background:"#f9fafb",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Analyse IA */}
          {!analysis && !loading && (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              {bets.length < 3 ? (
                <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:14,padding:"18px 20px"}}>
                  <div style={{fontSize:30,marginBottom:10}}>📋</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:6}}>Pas encore assez de données</div>
                  <div style={{fontSize:13,color:C.gray,lineHeight:1.5}}>Enregistre au moins 3 paris terminés pour que ton coach puisse t'analyser correctement.</div>
                </div>
              ) : (
                <div>
                  <div style={{fontSize:13,color:C.gray,marginBottom:20,lineHeight:1.6}}>L'IA va analyser ton historique complet pour identifier tes biais cachés, tes forces, et te donner 3 conseils personnalisés.</div>
                  <button onClick={run} style={{background:`linear-gradient(135deg,${C.green},#22c55e)`,color:"#fff",border:"none",borderRadius:13,padding:"13px 32px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                    Analyser mon profil →
                  </button>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{fontSize:34,marginBottom:14}}>🧠</div>
              <div style={{fontSize:15,fontWeight:800,color:"#111827",marginBottom:8}}>Analyse en cours...</div>
              <div style={{fontSize:13,color:C.gray,lineHeight:1.9}}>
                Étude de tes patterns de sélection<br/>
                Détection des biais cachés<br/>
                Analyse temporelle de tes paris<br/>
                Rédaction de tes conseils personnalisés
              </div>
            </div>
          )}

          {analysis && !loading && <div>{formatCoach(analysis)}</div>}
        </div>
      </div>
    </div>
  );
}

function HistoryScreen({ user, bets, setBets, setDebriefTarget }) {
  const pending = bets.filter(b=>b.status==="pending");
  const done = bets.filter(b=>b.status!=="pending");
  const won = done.filter(b=>b.status==="won");
  const totalMise = bets.reduce((a,b)=>a+b.mise,0);
  const totalGain = won.reduce((a,b)=>a+(b.mise*b.cote),0);
  const roi = totalMise>0?(((totalGain-totalMise)/totalMise)*100).toFixed(1):"0.0";
  const mark = async (bet,status) => { const updated = await updateBet(user.email,bet.id,{status}); setBets(updated); };

  return (
    <div style={{paddingBottom:40}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
        {[{l:"Paris joués",v:bets.length,col:"#111827"},{l:"Taux de réussite",v:`${done.length>0?((won.length/done.length)*100).toFixed(0):0}%`,col:C.green},{l:"ROI",v:`${roi}%`,col:parseFloat(roi)>=0?C.green:"#dc2626"}].map((s,i)=>(
          <div key={i} style={{background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"14px 10px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:s.col}}>{s.v}</div>
            <div style={{fontSize:11,color:C.gray,fontWeight:600,marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      {pending.length>0&&(
        <div style={{marginBottom:22}}>
          <div style={{fontSize:13,fontWeight:800,color:"#111827",marginBottom:12,textTransform:"uppercase",letterSpacing:0.6}}>⏳ En attente de résultat</div>
          {pending.map(bet=>(
            <div key={bet.id} style={{background:"#fff",border:`1.5px solid #fde68a`,borderRadius:14,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:3}}>{bet.sport==="tennis"?"🎾":"⚽"} {bet.tournament} · {bet.date} · {bet.bookmaker}</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#111827"}}>{bet.match}</div>
                  <div style={{fontSize:13,color:C.green,fontWeight:700,marginTop:2}}>→ {bet.pick} @ {bet.cote}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:C.gray}}>Mise</div>
                  <div style={{fontSize:16,fontWeight:900,color:"#111827"}}>{bet.mise}€</div>
                  <div style={{fontSize:11,color:C.gray,marginTop:2}}>Potentiel</div>
                  <div style={{fontSize:14,fontWeight:800,color:C.green}}>{bet.gainPotentiel}€</div>
                </div>
              </div>
              <div style={{fontSize:12,color:C.gray,marginBottom:8}}>Match terminé ? Marque le résultat :</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>mark(bet,"won")} style={{flex:1,background:C.lightGreen,border:`1.5px solid ${C.borderGreen}`,borderRadius:10,padding:"9px 0",fontWeight:800,fontSize:13,color:C.green,cursor:"pointer",fontFamily:"inherit"}}>✅ Pari passé !</button>
                <button onClick={()=>mark(bet,"lost")} style={{flex:1,background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"9px 0",fontWeight:800,fontSize:13,color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>❌ Pari raté</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {done.length>0&&(
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#111827",marginBottom:12,textTransform:"uppercase",letterSpacing:0.6}}>📋 Historique</div>
          {done.map(bet=>(
            <div key={bet.id} style={{background:"#fff",border:`1.5px solid ${bet.status==="won"?C.borderGreen:"#fca5a5"}`,borderRadius:14,padding:"13px 16px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:2}}>{bet.sport==="tennis"?"🎾":"⚽"} {bet.tournament} · {bet.date}</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>{bet.match}</div>
                  <div style={{fontSize:12,color:C.gray,marginTop:2}}>{bet.pick} @ {bet.cote} · {bet.mise}€ · {bet.bookmaker}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <span style={{background:bet.status==="won"?C.lightGreen:"#fef2f2",color:bet.status==="won"?C.green:"#dc2626",border:`1px solid ${bet.status==="won"?C.borderGreen:"#fca5a5"}`,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800}}>{bet.status==="won"?"✅ Passé":"❌ Raté"}</span>
                  <div style={{fontSize:14,fontWeight:900,color:bet.status==="won"?C.green:"#dc2626",marginTop:6}}>{bet.status==="won"?`+${(bet.mise*bet.cote-bet.mise).toFixed(2)}€`:`-${bet.mise}€`}</div>
                </div>
              </div>
              <button onClick={()=>setDebriefTarget(bet)} style={{width:"100%",background:"#f9fafb",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"8px 0",fontWeight:700,fontSize:12,color:"#374151",cursor:"pointer",fontFamily:"inherit"}}>
                🧠 Voir le debrief
              </button>
            </div>
          ))}
        </div>
      )}

      {bets.length===0&&(
        <div style={{textAlign:"center",padding:"48px 0",color:C.gray}}>
          <div style={{fontSize:40,marginBottom:12}}>📋</div>
          <div style={{fontSize:16,fontWeight:700,color:"#111827",marginBottom:6}}>Aucun pari enregistré</div>
          <div style={{fontSize:13}}>Analyse un match et enregistre ton premier pari</div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────
export default function BetTrust() {
  const [user, setUser] = useState(null);
  const [showHero, setShowHero] = useState(true);
  const [heroTab, setHeroTab] = useState("login");
  const [tab, setTab] = useState("matches");
  const [sport, setSport] = useState("tennis");
  const [matches, setMatches] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [analysisTarget, setAnalysisTarget] = useState(null);
  const [addBetTarget, setAddBetTarget] = useState(null);
  const [debriefTarget, setDebriefTarget] = useState(null);
  const [showSmartCombo, setShowSmartCombo] = useState(false);
  const [lineupTarget, setLineupTarget] = useState(null);
  const [halftimeTarget, setHalftimeTarget] = useState(null);
  const [showCoach, setShowCoach] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [bets, setBets] = useState([]);
  const [sub, setSub] = useState(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [consent, setConsent] = useState(null);
  const [consentLoaded, setConsentLoaded] = useState(false);
  const [exclusivityShown, setExclusivityShown] = useState(
    typeof localStorage !== "undefined" && localStorage.getItem("bt_excl_shown") === "true"
  );
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [ratingChecked, setRatingChecked] = useState(false);
  const [allMatches, setAllMatches] = useState([]); // tennis + football, pour le radar du jour

  useEffect(() => {
    if (!user) return;
    getBets(user.email, user.token).then(setBets);
    getSubscription(user.email, user.token).then(s => { setSub(s); setSubLoaded(true); });
    getLastSeen(user.email, user.token).then(setLastSeen);
    getConsent(user.email, user.token).then(c => { setConsent(c); setConsentLoaded(true); });
    saveLastSeen(user.email, user.token);
  }, [user]);

  // Déclenche la demande d'avis dès qu'un pari "won" existe et que l'utilisateur
  // n'a ni déjà noté, ni déjà refusé de noter.
  useEffect(() => {
    if (!user || ratingChecked) return;
    const hasWonBet = bets.some(b => b.status === "won");
    if (!hasWonBet) return;
    (async () => {
      const given = await getRatingGiven(user.email);
      const dismissed = await getRatingDismissed(user.email);
      if (!given && !dismissed) setShowRatingPrompt(true);
      setRatingChecked(true);
    })();
  }, [user, bets, ratingChecked]);

  useEffect(() => {
    if (!user) return;
    setLoadingMatches(true); setApiError(false); setMatches([]);
    // Matchs via backend
    fetchAllMatches(sport)
      .then(raw => {
        const parsed = raw.map(r=>parseOddsMatch(r,sport)).filter(Boolean);
        if (parsed.length === 0) { setMatches(DEMO_MATCHES[sport]); setApiError(true); }
        else setMatches(parsed);
      })
      .catch(() => { setMatches(DEMO_MATCHES[sport]); setApiError(true); })
      .finally(() => setLoadingMatches(false));
  }, [user, sport]);

  // Charge tennis + football ensemble une fois, pour alimenter le radar du jour
  // (indépendamment du filtre sport actif sur l'écran principal).
  useEffect(() => {
    if (!user) return;
    // allMatches via backend
    Promise.all([fetchAllMatches("tennis"), fetchAllMatches("football")])
      .then(([t, f]) => {
        const parsedT = t.map(r=>parseOddsMatch(r,"tennis")).filter(Boolean);
        const parsedF = f.map(r=>parseOddsMatch(r,"football")).filter(Boolean);
        const combined = [...parsedT, ...parsedF];
        setAllMatches(combined.length > 0 ? combined : [...DEMO_MATCHES.tennis, ...DEMO_MATCHES.football]);
      })
      .catch(() => setAllMatches([...DEMO_MATCHES.tennis, ...DEMO_MATCHES.football]));
  }, [user]);

  const onBetSaved = (bet) => { setBets(prev=>[bet,...prev]); setAddBetTarget(null); };

  if (showHero && !user) return <HeroScreen onEnter={(tab) => { setHeroTab(tab); setShowHero(false); }} />;
  if (!user) return <AuthScreen onLogin={setUser} initialTab={heroTab} />;

  if (consentLoaded && !consent) {
    return <ConsentScreen user={user} onAccept={() => setConsent(new Date().toISOString())} />;
  }

  if (consent && !exclusivityShown) {
    return <ExclusivityScreen onContinue={() => {
      localStorage.setItem("bt_excl_shown", "true");
      setExclusivityShown(true);
    }} />;
  }

  if (subLoaded) {
    const status = getSubStatus(sub);
    const isAdmin = user.email === "solo75lifee@gmail.com";
    if (!isAdmin && (status.status === "none" || status.status === "expired")) {
      return (
        <SubscriptionScreen
          user={user}
          sub={sub}
          onActivateTrial={(newSub) => setSub(newSub)}
          onSubscribed={(newSub) => setSub(newSub)}
        />
      );
    }
  }

  const theme = THEMES[sport];

  return (
    <div style={{minHeight:"100vh",background: tab==="matches" ? theme.bgDark : C.bg, fontFamily:"'Inter',system-ui,sans-serif", position:"relative", transition:"background 0.4s ease"}}>
      <GlobalAnimations />
      {tab==="matches" && (sport==="football" ? <FootballFieldBackground key="bg-football" /> : <ClayCourtBackground key="bg-tennis" />)}
      <div style={{position:"relative", zIndex:1}}>
      {/* HEADER */}
      <div style={{background: tab==="matches" ? "rgba(255,255,255,0.92)" : "#fff", backdropFilter: tab==="matches" ? "blur(8px)" : "none", borderBottom:`1.5px solid ${C.border}`,padding:"0 18px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:860,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:9}} className="anim-fadeup">
            <BetTrustLockup size={30} light={false} />
            <span style={{fontSize:10,fontWeight:700,background:C.lightGreen,color:C.green,padding:"2px 8px",borderRadius:99,border:`1px solid ${C.borderGreen}`}}>IA 360°</span>
            <SubStatusBadge sub={sub} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,fontWeight:600,color:C.gray}}>👋 {user.name}</span>
            <button onClick={()=>{setUser(null);setBets([]);}} style={{background:"none",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"4px 11px",cursor:"pointer",fontSize:12,color:C.gray,fontWeight:600,fontFamily:"inherit"}}>Déco</button>
          </div>
        </div>
      </div>

      {/* TABS NAV */}
      <div style={{background:"#fff",borderBottom:`1px solid ${C.border}`,padding:"0 18px"}}>
        <div style={{maxWidth:860,margin:"0 auto",display:"flex",gap:0}}>
          {[{k:"matches",l:"🔍 Matchs"},{k:"history",l:`📋 Paris${bets.length>0?` (${bets.length})`:""}`},{k:"coach",l:"🏆 Coach"},{k:"scanner",l:"🎯 Scanner"}].map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"12px 18px",background:"none",border:"none",borderBottom:tab===t.k?`2.5px solid ${C.green}`:"2.5px solid transparent",fontWeight:700,fontSize:13,color:tab===t.k?C.green:C.gray,cursor:"pointer",fontFamily:"inherit"}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"20px 14px"}}>
        {tab==="matches" ? (
          <div>
            {!bannerDismissed && <InactivityBanner lastSeenISO={lastSeen} onDismiss={()=>setBannerDismissed(true)} />}
            <PWAInstallPrompt />

            <RadarBanner allMatches={allMatches} onSelectMatch={(m)=>{ setSport(m.sport); setAnalysisTarget(m); }} />

            {/* BOUTON COMBINÉ INTELLIGENT */}
            <button onClick={()=>setShowSmartCombo(true)} style={{width:"100%",background:"linear-gradient(135deg,#111827,#374151)",color:"#fff",border:"none",borderRadius:14,padding:"14px 20px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:18,boxShadow:"0 4px 18px rgba(0,0,0,0.25)"}}>
              <span style={{fontSize:18}}>🧠</span>
              <span>Générer le combiné intelligent du jour</span>
              <span style={{fontSize:11,background:"rgba(255,255,255,0.15)",borderRadius:99,padding:"2px 10px",fontWeight:700}}>3 sélections</span>
            </button>

            {/* API KEY BANNER */}
            {apiError && (
              <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#dc2626"}}>
                ⚠️ Aucun match disponible pour le moment. Le serveur est peut-être en train de démarrer (30 secondes) — réessaie dans un instant.
              </div>
            )}

            {/* EXPLAINER : DÉTECTEUR PIÈGE / VALUE BET */}
            <div style={{background:"rgba(255,255,255,0.94)",backdropFilter:"blur(6px)",border:"1.5px solid rgba(255,255,255,0.6)",borderRadius:14,padding:"14px 16px",marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:800,color:"#111827",marginBottom:6}}>🪤💎 Le détecteur BetTrust</div>
              <div style={{fontSize:12,color:C.gray,lineHeight:1.6}}>
                Sur chaque match, on compare ce que dit la cote à ce que dit notre analyse. Un badge <strong style={{color:"#dc2626"}}>🪤 Piège</strong> veut dire que le favori est sur-coté par le public. Un badge <strong style={{color:"#0ea5e9"}}>💎 Bon plan</strong> veut dire qu'une chance est sous-évaluée par le marché.
              </div>
            </div>


            {/* SPORT TABS */}
            <div style={{display:"flex",gap:6,background:"rgba(255,255,255,0.18)",borderRadius:12,padding:4,marginBottom:14,width:"fit-content",backdropFilter:"blur(4px)"}}>
              {[{k:"tennis",l:"🎾 Tennis"},{k:"football",l:"⚽ Football"}].map(t=>(
                <button key={t.k} onClick={()=>{setSport(t.k);setSearch("");}} style={{padding:"8px 20px",borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:sport===t.k?"#fff":"transparent",color:sport===t.k?THEMES[t.k].accent:"rgba(255,255,255,0.85)",boxShadow:sport===t.k?"0 1px 6px rgba(0,0,0,0.15)":"none",transition:"all 0.15s"}}>{t.l}</button>
              ))}
            </div>

            {/* BARRE DE RECHERCHE */}
            <div style={{position:"relative",marginBottom:16}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:16,pointerEvents:"none"}}>🔍</span>
              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder={`Rechercher un match ${sport==="tennis"?"de tennis":"de football"}...`}
                style={{width:"100%",background:"rgba(255,255,255,0.92)",backdropFilter:"blur(6px)",border:"1.5px solid rgba(255,255,255,0.6)",borderRadius:12,padding:"11px 14px 11px 38px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",color:"#111827"}}
              />
              {search && (
                <button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.gray}}>✕</button>
              )}
            </div>

            {loadingMatches ? (
              <div style={{textAlign:"center",padding:"48px 0",background:"rgba(255,255,255,0.92)",borderRadius:16}}>
                <div style={{fontSize:32,marginBottom:12}}>⏳</div>
                <div style={{fontSize:15,fontWeight:700,color:"#111827"}}>Chargement des matchs en direct...</div>
                <div style={{fontSize:13,color:C.gray,marginTop:6}}>Connexion à The Odds API</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <style>{`
                  @keyframes cardIn {
                    from { opacity:0; transform: translateY(18px) scale(0.97); }
                    to   { opacity:1; transform: translateY(0)    scale(1); }
                  }
                  @keyframes coteIn {
                    from { opacity:0; transform: scale(0.8); }
                    to   { opacity:1; transform: scale(1); }
                  }
                  @keyframes btnGlow {
                    0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
                    50%     { box-shadow: 0 0 12px 3px rgba(22,163,74,0.25); }
                  }
                `}</style>
                {matches
                  .filter(match => !search || `${match.p1} ${match.p2} ${match.tournament}`.toLowerCase().includes(search.toLowerCase()))
                  .map((match, idx)=>{
                  const opts=[{label:match.p1,cote:match.c1},...(match.cN?[{label:"Nul",cote:match.cN}]:[]),{label:match.p2,cote:match.c2}];
                  const best = opts.reduce((a,b)=>a.cote<b.cote?a:b);
                  const opponentCote = best.cote===match.c1 ? match.c2 : match.c1;
                  const conf = defaultConfidenceFromOdds(best.cote, opponentCote);
                  const signal = getEdgeSignal(best.cote, conf);
                  return (
                    <div key={match.id} style={{
                      position:"relative",
                      background:theme.surface,
                      border:signal.type!=="neutral"?`2px solid ${signal.border}`:`1.5px solid ${theme.line}`,
                      borderRadius:16,padding:"15px 17px",
                      boxShadow:"0 4px 16px rgba(0,0,0,0.12)",
                      animation:`cardIn 0.4s cubic-bezier(.34,1.2,.64,1) both`,
                      animationDelay:`${idx * 0.07}s`,
                    }}>
                      <EdgeBadge signal={signal} />
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,marginTop:signal.type!=="neutral"?6:0}}>
                        <div>
                          <div style={{fontSize:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>
                            {match.tournament} · {match.date} à {match.time}
                          </div>
                          <div style={{fontSize:16,fontWeight:900,color:theme.ink}}>{match.p1} <span style={{color:"#d1d5db",fontWeight:400,fontSize:13}}>vs</span> {match.p2}</div>
                        </div>
                        <div style={{fontSize:11,background:theme.surfaceAlt,color:theme.accent,padding:"3px 9px",borderRadius:99,fontWeight:700,whiteSpace:"nowrap"}}>{match.bookmaker}</div>
                      </div>
                      <div style={{display:"flex",gap:7,marginBottom:12}}>
                        {opts.map((o,i)=>(
                          <div key={i} style={{
                            flex:1,textAlign:"center",
                            background:best.label===o.label?theme.surfaceAlt:"#f9fafb",
                            border:`1.5px solid ${best.label===o.label?theme.accent:theme.line}`,
                            borderRadius:10,padding:"9px 4px",
                            animation:`coteIn 0.35s ease both`,
                            animationDelay:`${idx * 0.07 + 0.15 + i * 0.06}s`,
                          }}>
                            <div style={{fontSize:10,color:C.gray,fontWeight:600,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.label}</div>
                            <div style={{fontSize:17,fontWeight:900,color:best.label===o.label?theme.accent:theme.ink}}>{o.cote.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                      <EdgeGauge signal={signal} compact />
                      <div style={{display:"flex",gap:8,marginTop:signal.type!=="neutral"?12:0}}>
                        <button onClick={()=>setAnalysisTarget(match)} style={{flex:1,background:`linear-gradient(135deg,${theme.accent},${theme.accentDark})`,color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",animation:`btnGlow 2.5s ease-in-out ${idx * 0.07 + 0.5}s infinite`}}>🔍 Analyse IA 360°</button>
                        <button onClick={()=>setAddBetTarget(match)} style={{flex:1,background:theme.surfaceAlt,color:theme.accent,border:`1.5px solid ${theme.accent}55`,borderRadius:10,padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Mon pari</button>
                      </div>
                      {match.sport==="football" && (
                        <div style={{display:"flex",gap:8,marginTop:8}}>
                          <button onClick={()=>setLineupTarget(match)} style={{flex:1,background:"#f0f9ff",color:"#0ea5e9",border:"1.5px solid #93c5fd",borderRadius:10,padding:"9px 0",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>👥 Compositions</button>
                          <button onClick={()=>setHalftimeTarget(match)} style={{flex:1,background:"#fffbeb",color:"#ca8a04",border:"1.5px solid #fde68a",borderRadius:10,padding:"9px 0",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>⏱️ Mi-temps live</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {matches.length===0&&!loadingMatches&&(
                  <div style={{textAlign:"center",padding:"48px 0",background:"rgba(255,255,255,0.9)",borderRadius:16,color:C.gray}}>
                    <div style={{fontSize:36,marginBottom:12}}>📭</div>
                    <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:6}}>Aucun match disponible</div>
                    <div style={{fontSize:13}}>Aucune rencontre {sport==="tennis"?"de tennis":"de football"} programmée pour le moment.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab==="history" ? (
          <HistoryScreen user={user} bets={bets} setBets={setBets} setDebriefTarget={setDebriefTarget} />
        ) : tab==="coach" ? (
          <div style={{paddingBottom:40}}>
            {/* Bouton d'accès au coach */}
          <div style={{background:"linear-gradient(135deg,#0f2d1a,#16a34a)",borderRadius:18,padding:"28px 22px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:8}}>🏆</div>
            <div style={{fontSize:13,color:"#86efac",fontWeight:700,letterSpacing:0.5,marginBottom:4,textTransform:"uppercase"}}>Ton coach attitré</div>
            <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5,marginBottom:6}}>{user.coachName || generateCoachName(user.email)}</div>
            <div style={{fontSize:13,color:"#bbf7d0",marginBottom:20,lineHeight:1.6}}>
              Ton coach personnel analyse ton historique pour identifier tes biais, tes forces, et te donner des conseils sur mesure.
            </div>
            <button onClick={()=>setShowCoach(true)} style={{background:"#fff",color:C.green,border:"none",borderRadius:13,padding:"13px 32px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Consulter {user.coachName || generateCoachName(user.email)} →
            </button>
          </div>

            {/* Mini stats résumé */}
            {bets.length > 0 && (()=>{
              const stats = computeCoachStats(bets);
              const done = bets.filter(b=>b.status!=="pending");
              const won = bets.filter(b=>b.status==="won");
              return (
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                  {[
                    {l:"Paris enregistrés",v:bets.length,icon:"📋"},
                    {l:"Taux de réussite",v:`${done.length>0?((won.length/done.length)*100).toFixed(0):0}%`,icon:"🎯"},
                    {l:"ROI total",v:`${stats.roi}%`,icon:"💰"},
                    {l:"Sport dominant",v:stats.topSport==="tennis"?"🎾 Tennis":"⚽ Football",icon:"🏅"},
                  ].map((s,i)=>(
                    <div key={i} style={{background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"16px 14px",textAlign:"center"}}>
                      <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
                      <div style={{fontSize:18,fontWeight:900,color:"#111827"}}>{s.v}</div>
                      <div style={{fontSize:11,color:C.gray,fontWeight:600,marginTop:3}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {bets.length === 0 && (
              <div style={{textAlign:"center",padding:"32px 16px",background:"#fff",borderRadius:16,border:`1.5px solid ${C.border}`}}>
                <div style={{fontSize:36,marginBottom:12}}>📋</div>
                <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:6}}>Aucun pari enregistré</div>
                <div style={{fontSize:13,color:C.gray}}>Commence à enregistrer tes paris pour que ton coach puisse t'analyser.</div>
              </div>
            )}
          </div>
        ) : tab==="scanner" ? (
          <div style={{paddingBottom:40}}>
            <div style={{background:"linear-gradient(135deg,#111827,#374151)",borderRadius:18,padding:"28px 22px",marginBottom:20,textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:10}}>🔎</div>
              <div style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:8}}>Scanner de cote</div>
              <div style={{fontSize:13,color:"#9ca3af",marginBottom:20,lineHeight:1.6}}>
                Tu vois une cote intéressante sur Winamax, Betclic ou Unibet ? Entre-la ici — l'IA analyse en 10 secondes si c'est une value bet ou un piège.
              </div>
              <button onClick={()=>setShowScanner(true)} style={{background:"#fff",color:"#111827",border:"none",borderRadius:13,padding:"13px 32px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                Scanner une cote →
              </button>
            </div>
            <div style={{background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:16,padding:"18px 20px"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#111827",marginBottom:12}}>Comment ça marche</div>
              {[
                {icon:"1️⃣",text:"Tu vois une cote sur ton appli de paris (ex: 2.40 sur PSG)"},
                {icon:"2️⃣",text:"Tu entres la cote et le contexte dans le scanner"},
                {icon:"3️⃣",text:"L'IA calcule si le marché se trompe — value ou piège"},
                {icon:"4️⃣",text:"Tu as un verdict tranché en moins de 10 secondes"},
              ].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:i<3?12:0}}>
                  <span style={{fontSize:18,flexShrink:0}}>{s.icon}</span>
                  <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {analysisTarget&&<AnalysisPanel match={analysisTarget} onClose={()=>setAnalysisTarget(null)} />}
      {addBetTarget&&<AddBetModal match={addBetTarget} user={user} onSave={onBetSaved} onClose={()=>setAddBetTarget(null)} />}
      {debriefTarget&&<DebriefPanel bet={debriefTarget} onClose={()=>setDebriefTarget(null)} />}
      {showRatingPrompt&&<RatingPrompt user={user} onDone={()=>setShowRatingPrompt(false)} />}
      {lineupTarget&&<LineupPanel match={lineupTarget} onClose={()=>setLineupTarget(null)} />}
      {halftimeTarget&&<HalftimePanel match={halftimeTarget} onClose={()=>setHalftimeTarget(null)} />}
      {showCoach&&<CoachPanel user={user} bets={bets} onClose={()=>setShowCoach(false)} />}
      {showScanner&&<ScannerPanel onClose={()=>setShowScanner(false)} />}
      {showSmartCombo&&(
        <SmartComboPanel
          allMatches={allMatches}
          onClose={()=>setShowSmartCombo(false)}
          onAddToBets={async (combo)=>{
            // Enregistre chaque sélection du combiné comme un pari groupé
            const comboId = Date.now().toString();
            for (const s of combo.selections) {
              const bet = {
                id: comboId + "_" + s.match.id,
                matchId: s.match.id,
                sport: s.match.sport,
                match: `${s.match.p1} vs ${s.match.p2}`,
                tournament: s.match.tournament,
                date: s.match.date || "Aujourd'hui",
                time: s.match.time,
                pick: s.best.label,
                cote: s.best.cote,
                mise: 0, // l'utilisateur saisira la mise plus tard
                bookmaker: "À définir",
                status: "pending",
                type: "combiné intelligent",
                comboId,
                createdAt: new Date().toISOString(),
                gainPotentiel: "0",
              };
              await saveBet(user.email, bet);
            }
            const updated = await getBets(user.email);
            setBets(updated);
            setShowSmartCombo(false);
            setTab("history");
          }}
        />
      )}
      </div>
    </div>
  );
}
