import { SlashCommandBuilder } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Solo este rol puede usar /all (y /stopall)
const ALL_ROLE_ID = process.env.ALL_ROLE_ID || "1285846827572133929";
const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "all_broadcast.json");

const CONCURRENCY = 3;
const GAP_MS = 1100;          // ~3 MD por segundo (bajo el riesgo de spam)
const MAX_INTENTOS = 4;
const MIN_ENTRE_BROADCASTS_MS = 30 * 60 * 1000;   // 30 min entre envíos

function tieneRol(member) {
  return !!(member && member.roles && member.roles.cache && member.roles.cache.has(ALL_ROLE_ID));
}

function leerBroadcast() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) {
    return null;
  }
}

function guardarBroadcast(refs) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(refs, null, 1), "utf8");
  } catch (e) {
    console.error("❌ [ALL] no pude guardar el índice:", e.message);
  }
}

function classify(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || "").toLowerCase();
  if (code === 50007 || msg.includes("cannot send messages to this user")) return "closed";
  if (code === 429 || msg.includes("rate limit") || msg.includes("too many")) return "limited";
  return "other";
}

export async function execute(interaction) {
  const texto = interaction.options.getString("texto", true);
  const confirmar = interaction.options.getBoolean("confirmar");

  if (!tieneRol(interaction.member)) {
    return interaction.reply({ content: "❌ Este comando solo lo puede usar el rol autorizado.", flags: 64 });
  }

  // ── Protección anti-spam 1: solo UN broadcast activo a la vez ──
  const activo = leerBroadcast();
  if (activo) {
    return interaction.reply({
      content:
        `🗑️ **Ya hay un broadcast activo** (${activo.length} MD enviados).\n` +
        `Primero ejecutá **/stopall** para borrarlo y después volvé a enviar.`,
      flags: 64,
    });
  }

  const guild = interaction.guild;
  const members = await guild.members.fetch();
  const targets = [...members.values()].filter((m) => !m.user.bot && !m.user.system);

  // ── Protección anti-spam 2: doble confirmación ──
  if (!confirmar) {
    return interaction.reply({
      content:
        `⚠️ **Vas a enviar un MD privado a ${targets.length} miembros.**\n` +
        `Esto puede reportar el bot como spam si se usa seguido (mínimo 30 minutos entre envíos).\n` +
        `Alternative más segura: un anuncio con **@everyone** en un canal.\n\n` +
        `Para confirmar, volvé a ejecutar el comando con la opción **confirmar ✅**.`,
      flags: 64,
    });
  }

  // ── Protección anti-spam 3: 30 min desde el último broadcast ──
  try {
    const meta = DATA_FILE.replace("all_broadcast.json", "all_broadcast.meta.json");
    if (fs.existsSync(meta)) {
      const m = JSON.parse(fs.readFileSync(meta, "utf8"));
      const falta = MIN_ENTRE_BROADCASTS_MS - (Date.now() - (m.at || 0));
      if (falta > 0) {
        return interaction.reply({
          content: `⏳ Esperá **${Math.ceil(falta / 60000)} min** más antes de otro broadcast (límite anti-spam).`,
          flags: 64,
        });
      }
    }
  } catch (e) {}

  await interaction.deferReply({ flags: 64 });

  try {
    const stats = { sent: 0, closed: 0, limited: 0, other: 0 };
    const refs = [];
    const t0 = Date.now();
    let backoffUntil = 0;
    let idx = 0;
    let progress = null;
    let ultimoAviso = 0;

    try {
      progress = await interaction.channel.send(
        `📤 **Enviando mensaje privado a ${targets.length} miembros…** (≈${CONCURRENCY} por segundo)`
      );
    } catch (e) {}

    async function sendOne(u) {
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        if (Date.now() < backoffUntil) await sleep(backoffUntil - Date.now());
        try {
          const msg = await u.send(texto);
          stats.sent++;
          refs.push({ user: u.user.id, channel: msg.channel.id, message: msg.id });
          if (refs.length % 25 === 0) guardarBroadcast(refs);
          return;
        } catch (err) {
          const kind = classify(err);
          if (kind === "limited") {
            stats.limited++;
            const retry = (err && err.rawError && err.rawError.retry_after) || err.retryAfter || 3;
            backoffUntil = Date.now() + Math.ceil((Number(retry) + 0.5) * 1000);
            continue;
          }
          if (kind === "closed") stats.closed++;
          else stats.other++;
          return;
        }
      }
      stats.other++;
    }

    async function worker() {
      while (true) {
        const i = idx++;
        if (i >= targets.length) return;
        await sendOne(targets[i]);
        const total = stats.sent + stats.closed + stats.other;
        const elapsed = Date.now() - t0;
        if (progress && (total % 40 === 0 || elapsed - ultimoAviso > 15000)) {
          ultimoAviso = elapsed;
          await progress
            .edit(
              `📤 **Enviando MD… ${total}/${targets.length}** · ✅ ${stats.sent}` +
              ` · 🚫 MD cerrado: ${stats.closed}` +
              (stats.other ? ` · ❌ otros: ${stats.other}` : "") +
              ` · ${Math.round(elapsed / 1000)}s`
            )
            .catch(() => {});
        }
        await sleep(GAP_MS);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    guardarBroadcast(refs);
    try {
      const meta = DATA_FILE.replace("all_broadcast.json", "all_broadcast.meta.json");
      fs.writeFileSync(meta, JSON.stringify({ at: Date.now(), sent: stats.sent }), "utf8");
    } catch (e) {}

    const mins = Math.round((Date.now() - t0) / 60000);
    const resumen =
      `✅ **Mensaje privado enviado a ${stats.sent} de ${targets.length} miembros** (${mins} min).\n` +
      `🚫 ${stats.closed} tienen los MD cerrados (privacidad de Discord).\n` +
      (stats.other ? `❌ ${stats.other} con otro error.\n` : "") +
      `⚠️ Usá **/stopall** para borrar este mensaje de todos los MD.`;

    if (progress) await progress.edit(resumen).catch(() => {});
    await interaction
      .editReply({ content: `✅ Listo: ${stats.sent} enviados · ${stats.closed} MD cerrados · ${stats.other} errores.` })
      .catch(() => {});
    console.log(`📩 [ALL] ${interaction.user.tag} → enviados=${stats.sent} cerrados=${stats.closed} otros=${stats.other} (${mins} min)`);
  } catch (e) {
    console.error("❌ [ALL] error:", e.message);
    await interaction.editReply({ content: "❌ Error: " + e.message }).catch(() => {});
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("all")
    .setDescription("📨 Envía un mensaje privado (MD) a TODA la comunidad (solo rol autorizado)")
    .addStringOption((o) =>
      o.setName("texto").setDescription("Mensaje que recibirán todos por MD").setRequired(true))
    .addBooleanOption((o) =>
      o.setName("confirmar").setDescription("✅ Confirmar el envío masivo").setRequired(true)),
  execute,
};
