import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONCURRENCY = 3;     // 3 en paralelo ≈ 4 MD por segundo
const GAP_MS = 700;
const MAX_INTENTOS = 4;

function classify(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || "").toLowerCase();
  if (code === 50007 || msg.includes("cannot send messages to this user")) return "closed";
  if (code === 429 || msg.includes("rate limit") || msg.includes("too many")) return "limited";
  return "other";
}

export async function execute(interaction) {
  const texto = interaction.options.getString("texto", true);
  const staffRole = process.env.STAFF_ROLE_ID;
  const member = interaction.member;

  const isAdmin = !!(member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
  const isStaff = !!(staffRole && member && member.roles && member.roles.cache.has(staffRole));
  if (!isAdmin && !isStaff) {
    return interaction.reply({ content: "❌ Solo staff o administradores pueden usar /all.", flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const guild = interaction.guild;
    const members = await guild.members.fetch();
    const targets = [...members.values()].filter((m) => !m.user.bot && !m.user.system);

    const stats = { sent: 0, closed: 0, limited: 0, other: 0 };
    const t0 = Date.now();
    let backoffUntil = 0;
    let idx = 0;
    let progress = null;
    let ultimoAviso = 0;

    // Mensaje público de progreso (el token de interacción muere a los 15 min;
    // un mensaje normal se puede editar siempre).
    try {
      progress = await interaction.channel.send(
        `📤 **Enviando mensaje privado a ${targets.length} miembros…** ` +
        `(≈${CONCURRENCY} por segundo)`
      );
    } catch (e) {}

    async function sendOne(u) {
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        if (Date.now() < backoffUntil) await sleep(backoffUntil - Date.now());
        try {
          await u.send(texto);
          stats.sent++;
          return;
        } catch (err) {
          const kind = classify(err);
          if (kind === "limited") {
            stats.limited++;
            const retry = (err && err.rawError && err.rawError.retry_after) || err.retryAfter || 3;
            backoffUntil = Date.now() + Math.ceil((Number(retry) + 0.5) * 1000);
            continue;                       // respeta el límite y reintenta
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

    const procesados = stats.sent + stats.closed + stats.other;
    const mins = Math.round((Date.now() - t0) / 60000);
    const resumen =
      `✅ **Mensaje privado enviado a ${stats.sent} de ${targets.length} miembros** (${mins} min).\n` +
      `🚫 ${stats.closed} tienen los MD cerrados (privacidad de Discord: no les llega nada).\n` +
      (stats.other ? `❌ ${stats.other} con otro error.\n` : "") +
      (stats.sent === 0
        ? "⚠️ **Nadie lo recibió.** Revisa la configuración de privacidad de tu servidor."
        : "");

    if (progress) await progress.edit(resumen).catch(() => {});
    await interaction
      .editReply({ content: `✅ Listo: ${stats.sent} enviados · ${stats.closed} MD cerrados · ${stats.other} errores (${procesados} procesados).` })
      .catch(() => {});
    console.log(`📩 [ALL] ${interaction.user.tag} → enviados=${stats.sent} cerrados=${stats.closed} otros=${stats.other} limited=${stats.limited} (${mins} min)`);
  } catch (e) {
    console.error("❌ [ALL] error:", e.message);
    await interaction.editReply({ content: "❌ Error: " + e.message }).catch(() => {});
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("all")
    .setDescription("Envía un mensaje privado (MD) a TODA la comunidad")
    .addStringOption((o) =>
      o.setName("texto").setDescription("Mensaje que recibirán todos por MD").setRequired(true)),
  execute,
};
