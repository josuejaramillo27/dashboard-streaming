const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const PORTAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function makePortalCode(length = 4) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PORTAL_CODE_ALPHABET[crypto.randomInt(0, PORTAL_CODE_ALPHABET.length)];
  }
  return out;
}

function hashKey(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitizeStore(uid, data) {
  return {
    uid,
    name: data.name || "Mi Portal",
    logoUrl: data.logoUrl || "",
    phone: data.phone || ""
  };
}

function sanitizeMultiAccounts(multiAccounts) {
  if (!multiAccounts || typeof multiAccounts !== "object") return {};
  const safe = {};
  for (const [platform, acc] of Object.entries(multiAccounts)) {
    safe[platform] = {
      email: acc?.email || "",
      password: acc?.password || "",
      profile: acc?.profile || "",
      pin: acc?.pin || ""
    };
  }
  return safe;
}

function sanitizeClient(data) {
  return {
    name: data.name || "Cliente",
    platform: data.platform || "Servicio",
    date: data.date || "",
    accountEmail: data.accountEmail || "",
    accountPassword: data.accountPassword || "",
    accountProfile: data.accountProfile || "",
    accountPin: data.accountPin || "",
    multiAccounts: sanitizeMultiAccounts(data.multiAccounts)
  };
}

async function resolvePortal(portalId) {
  if (!portalId) return null;

  const byAlias = await db.collection("users")
    .where("storeAlias", "==", portalId)
    .limit(1)
    .get();

  if (!byAlias.empty) {
    const doc = byAlias.docs[0];
    return { uid: doc.id, data: doc.data() };
  }

  const direct = await db.collection("users").doc(portalId).get();
  if (direct.exists) return { uid: direct.id, data: direct.data() };
  return null;
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function checkRateLimit(rateRef) {
  const snap = await rateRef.get();
  if (!snap.exists) return { blocked: false };

  const data = snap.data() || {};
  const now = Date.now();
  const blockedUntil = Number(data.blockedUntil || 0);

  if (blockedUntil > now) {
    return {
      blocked: true,
      retryAfter: Math.ceil((blockedUntil - now) / 1000)
    };
  }
  return { blocked: false };
}

async function registerFailure(rateRef) {
  const now = Date.now();
  let retryAfter = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const current = snap.exists ? snap.data() : {};
    const oldWindowStart = Number(current.windowStart || 0);
    const insideWindow = oldWindowStart && (now - oldWindowStart < WINDOW_MS);
    const failures = insideWindow ? Number(current.failures || 0) + 1 : 1;
    const windowStart = insideWindow ? oldWindowStart : now;
    const blockedUntil = failures >= MAX_FAILURES ? now + BLOCK_MS : 0;

    tx.set(rateRef, {
      failures,
      windowStart,
      blockedUntil,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (blockedUntil) retryAfter = Math.ceil((blockedUntil - now) / 1000);
  });

  return retryAfter;
}

async function clearFailures(rateRef) {
  try { await rateRef.delete(); } catch (_) {}
}

exports.portalAccess = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ message: "Método no permitido" });

  try {
    const body = req.body || {};
    const action = String(body.action || "");
    const portalId = String(body.portalId || "").trim();

    if (!portalId || portalId.length > 120) {
      return res.status(400).json({ message: "Portal inválido" });
    }

    const portal = await resolvePortal(portalId);
    if (!portal) return res.status(404).json({ message: "Portal no encontrado" });

    const store = sanitizeStore(portal.uid, portal.data);

    if (action === "bootstrap") {
      return res.status(200).json({ store });
    }

    if (action !== "login") {
      return res.status(400).json({ message: "Acción inválida" });
    }

    const phone = cleanPhone(body.phone);
    const code = cleanCode(body.code);
    if (phone.length < 7 || phone.length > 18 || code.length !== 4) {
      return res.status(401).json({ message: "Datos incorrectos" });
    }

    const ip = getIp(req);
    const rateId = hashKey(`${portal.uid}|${ip}`);
    const rateRef = db.collection("portalRateLimits").doc(rateId);
    const rateStatus = await checkRateLimit(rateRef);

    if (rateStatus.blocked) {
      return res.status(429).json({
        message: "Demasiados intentos",
        retryAfter: rateStatus.retryAfter
      });
    }

    const clientsSnap = await db.collection("clients")
      .where("userId", "==", portal.uid)
      .get();

    const matched = [];
    clientsSnap.forEach((doc) => {
      const c = doc.data();
      const dbPhone = cleanPhone(c.phone);
      const phoneMatches = dbPhone === phone || dbPhone.endsWith(phone) || phone.endsWith(dbPhone);
      const codeMatches = cleanCode(c.portalCode) === code;
      if (phoneMatches && codeMatches) matched.push(sanitizeClient(c));
    });

    if (!matched.length) {
      const retryAfter = await registerFailure(rateRef);
      if (retryAfter) {
        return res.status(429).json({ message: "Demasiados intentos", retryAfter });
      }
      return res.status(401).json({ message: "Datos incorrectos" });
    }

    await clearFailures(rateRef);
    return res.status(200).json({ store, clients: matched });
  } catch (error) {
    console.error("portalAccess error", error);
    return res.status(500).json({ message: "Error interno del portal" });
  }
});

// Los clientes antiguos conservan su código actual para no romper accesos ya enviados.
// En clientes NUEVOS se reemplaza el código provisional del frontend por uno
// criptográficamente aleatorio de 4 caracteres. Si ese mismo teléfono ya tenía
// otro servicio, se reutiliza su código para que el cliente siga teniendo uno solo.
exports.securePortalCodeOnCreate = onDocumentCreated("clients/{clientId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const clientId = event.params.clientId;
  const data = snap.data() || {};
  const userId = data.userId;
  const phone = cleanPhone(data.phone);

  if (!userId || !phone) return;

  const userClients = await db.collection("clients")
    .where("userId", "==", userId)
    .get();

  let reusableCode = null;
  userClients.forEach((doc) => {
    if (doc.id === clientId || reusableCode) return;
    const other = doc.data();
    if (cleanPhone(other.phone) === phone && cleanCode(other.portalCode).length === 4) {
      reusableCode = cleanCode(other.portalCode);
    }
  });

  const secureCode = reusableCode || makePortalCode(4);
  await snap.ref.update({
    portalCode: secureCode,
    portalCodeSecuredAt: FieldValue.serverTimestamp(),
    portalCodeVersion: 2
  });
});
