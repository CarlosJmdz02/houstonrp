const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3001;

// Obtiene la IP pública (se llama al inicio y se cachea; se renueva cada 10 min)
let _cachedIp = null;
let _ipTs = 0;
function getPublicIp() {
  const now = Date.now();
  if (_cachedIp && now - _ipTs < 600000) return _cachedIp;
  try {
    _cachedIp = execSync("curl -s https://api.ipify.org?format=json", { timeout: 5000 }).toString();
    const parsed = JSON.parse(_cachedIp);
    _cachedIp = parsed.ip || "desconocida";
  } catch {
    _cachedIp = _cachedIp || "desconocida";
  }
  _ipTs = now;
  return _cachedIp;
}

app.use(cors());
app.use(express.json());

// ── Proxy para ER:LC API (usado por dispatch.html en local) ──
app.all('/v2/*', async (req, res) => {
  const apiPath = req.originalUrl;
  const serverKey = process.env.ERLC_SERVER_KEY;
  if (!serverKey) {
    return res.status(503).json({ error: 'ERLC_SERVER_KEY no configurado' });
  }
  try {
    const response = await fetch(`https://api.erlc.gg${apiPath}`, {
      method: req.method,
      headers: { 'server-key': serverKey, 'User-Agent': 'Mozilla/5.0', ...(req.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Bloquear archivos sensibles antes del static
app.use((req, res, next) => {
  const p = req.path;
  if (p.includes('.env') || p.startsWith('/node_modules') || p.startsWith('/.git') || p === '/package.json' || p === '/server.js' || p === '/netlify.toml') {
    return res.status(404).end();
  }
  next();
});

// ── Serve static files (HTML, JS, CSS, audios, images) ──
app.use(express.static(__dirname));

// ── Resolve Roblox username → userId ──
async function resolveUsername(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roblox users API: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data.data || data.data.length === 0) {
    throw new Error("Username not found");
  }
  return data.data[0].id;
}

// ── Fetch avatar headshot from Roblox thumbnails API ──
async function fetchAvatarHeadshot(userId) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roblox thumbnails API: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data.data || data.data.length === 0) {
    throw new Error("No thumbnail data returned");
  }
  const entry = data.data[0];
  if (entry.state !== "Completed") {
    throw new Error(`Thumbnail state: ${entry.state}`);
  }
  return entry.imageUrl;
}

// ── GET /api/roblox/resolve/:username ──
app.get("/api/roblox/resolve/:username", async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }
  try {
    const userId = await resolveUsername(username);
    res.json({ userId, username });
  } catch (err) {
    console.error("Resolve username error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── GET /api/roblox/avatar/:userId ──
app.get("/api/roblox/avatar/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId || isNaN(Number(userId))) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  try {
    const url = await fetchAvatarHeadshot(userId);
    res.json({ url, userId: Number(userId) });
  } catch (err) {
    console.error("Avatar fetch error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── GET /api/roblox/avatar/by-username/:username ──
app.get("/api/roblox/avatar/by-username/:username", async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }
  try {
    const userId = await resolveUsername(username);
    const url = await fetchAvatarHeadshot(userId);
    res.json({ url, userId });
  } catch (err) {
    console.error("Avatar by username error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Check if a Roblox user is currently in the ER:LC private server ──
app.get("/api/erlc/check/:robloxId", async (req, res) => {
  const robloxId = req.params.robloxId;
  if (!robloxId || isNaN(Number(robloxId))) {
    return res.status(400).json({ error: "Invalid robloxId" });
  }
  const serverKey = process.env.ERLC_SERVER_KEY || "VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL";
  try {
    const response = await fetch("https://api.erlc.gg/v2/server?Players=true", {
      headers: { "server-key": serverKey },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ER:LC API: ${response.status} ${text}`);
    }
    const data = await response.json();
    const players = data.Players || [];
    const player = players.find(p => {
      const parts = (p.Player || '').split(':');
      return parts[parts.length - 1] === String(robloxId);
    });
    res.json({ robloxId: Number(robloxId), inServer: !!player, team: player ? player.Team : null });
  } catch (err) {
    console.error("ER:LC check error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/erlc/jail ──
// Ejecuta el comando :jail desde server.js (IP fija) para evitar el problema
// de IPs rotativas de Netlify que causa errores 403 en el allowlist de ER:LC.
app.post("/api/erlc/jail", async (req, res) => {
  const { username, months } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: "Falta el usuario de Roblox" });
  }
  const minutes = parseInt(months, 10);
  if (!minutes || minutes <= 0) {
    return res.status(400).json({ error: "El arresto no tiene tiempo de prisión" });
  }
  if (minutes > 60) {
    return res.status(400).json({ error: "Máximo 60 minutos por condena en ER:LC" });
  }

  const serverKey = process.env.ERLC_SERVER_KEY || "VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL";
  const command = `:jail ${username} ${minutes}`;
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const apiRes = await fetch("https://api.erlc.gg/v2/server/command", {
        method: "POST",
        headers: {
          "server-key": serverKey,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ command }),
      });

      const body = await apiRes.json().catch(() => ({}));

      // Éxito
      if (apiRes.ok) {
        return res.json({ ok: true, username, minutes, result: body });
      }

      // Rate limit → reintentar
      if (apiRes.status === 429) {
        const retryAfter = (typeof body.retry_after === "number" ? body.retry_after : 1) + 0.5;
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }
        return res.status(429).json({ error: "La API de ER:LC está saturada. Espera unos segundos e inténtalo de nuevo." });
      }

      // 403 / not authorized → IP no está en la allowlist de ER:LC
      if (apiRes.status === 403 || String(body.error || "").includes("not authorized")) {
        return res.status(403).json({
          error: `La IP pública de este servidor (${getPublicIp()}) no está en la allowlist de ER:LC.`,
          ip: getPublicIp(),
          hint: "Agrega esta IP en la configuración de tu servidor privado de ER:LC."
        });
      }

      // Otros errores
      return res.status(apiRes.status).json({ error: body.error || body.message || `ER:LC API: ${apiRes.status}` });
    } catch (err) {
      return res.status(502).json({ error: err.message || "Error al contactar ER:LC API" });
    }
  }

  return res.status(502).json({ error: "Máximo de reintentos alcanzado." });
});

// ── Health check ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Houston RP backend running on http://localhost:${PORT}`);
});