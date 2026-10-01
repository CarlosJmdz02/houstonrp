import { SlashCommandBuilder } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mismo rol autorizado que /all
const ALL_ROLE_ID = process.env.ALL_ROLE_ID || "1285846827572133929";
const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "all_broadcast.json");
const GAP_MS = 1100;

function tieneRol(member) {
  return !!(member && member.roles && member.roles.cache && member.roles.cache.has(ALL_ROLE_ID));
}

function leerBroadcast() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) {
    console.error("❌ [STOPALL] no pude leer el índice:", e.message);
    return null;
  }
}

export async function execute(interaction) {
  if (!tieneRol(interaction.member)) {
    return interaction.reply({
      content: "❌ Este comando solo lo puede usar el rol autorizado.",
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  const refs = leerBroadcast();
  if (!refs) {
    return interaction
      .editReply({ content: "ℹ️ No hay ningún broadcast guardado (¿ya se borró o nunca se envió?)." })
      .catch(() => {});
  }

  let progress = null;
  try {
    progress = await interaction.channel.send(`🗑️ **Borrando el último broadcast de ${refs.length} MD…**`);
  } catch (e) {}

  let borrados = 0;
  let yaNoExiste = 0;
  let fallidos = 0;

  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    try {
      const ch = await interaction.client.channels.fetch(r.channel);
      const msg = await ch.messages.fetch(r.message);
      await msg.delete();
      borrados++;
    } catch (err) {
      const code = err && err.code;
      if (code === 10003 || code === 10008 || String(err.message).toLowerCase().includes("unknown message")) {
        yaNoExiste++;
      } else {
        fallidos++;
      }
    }

    if (progress && i % 40 === 39) {
      await progress
        .edit(`🗑️ **Borrando… ${i + 1}/${refs.length}** · ✅ ${borrados} · ⏭ ${yaNoExiste} · ❌ ${fallidos}`)
        .catch(() => {});
    }
    await sleep(GAP_MS);
  }

  const resumen =
    `🗑️ **Broadcast cancelado:** mensaje borrado de **${borrados}** MD` +
    (yaNoExiste ? ` · ${yaNoExiste} ya no existía` : "") +
    (fallidos ? ` · ${fallidos} fallidos` : "") + ".";

  try { fs.unlinkSync(DATA_FILE); } catch (e) {}
  if (progress) await progress.edit(resumen).catch(() => {});
  await interaction.editReply({ content: `✅ ${borrados} mensajes borrados.` }).catch(() => {});
  console.log(`🗑️ [STOPALL] ${interaction.user.tag} → borrados=${borrados} yaNo=${yaNoExiste} fallidos=${fallidos}`);
}

export default {
  data: new SlashCommandBuilder()
    .setName("stopall")
    .setDescription("🗑️ Borra el último mensaje enviado con /all de todos los MD (solo rol autorizado)"),
  execute,
};
