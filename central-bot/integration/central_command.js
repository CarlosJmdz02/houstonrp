import { SlashCommandBuilder } from "discord.js";
import { centralFromText } from "../utils/central.js";

export async function execute(interaction) {
  const texto = interaction.options.getString("texto", true);

  try {
    await interaction.deferReply({ flags: 64 });   // solo lo ve él
  } catch (e) {
    console.error("[central] defer falló:", e.message);
  }

  let r;
  try {
    r = await centralFromText(interaction.client, {
      discordId: interaction.user.id,
      tag: interaction.user.tag,
      text: texto,
    });
  } catch (e) {
    console.error("[central] /central error:", e.message);
    r = { ok: false, reply: "❌ Error interno al procesar. Probá de nuevo." };
  }

  try {
    await interaction.editReply({ content: (r.ok ? "✅ " : "") + r.reply });
  } catch (e) {
    console.error("[central] editReply falló:", e.message);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("central")
    .setDescription("Hablale a la central por TEXTO — te contesta POR VOZ en el canal")
    .addStringOption((o) =>
      o
        .setName("texto")
        .setDescription('Ej: 10-8 · código 4 · cuál es mi ubicación · necesito médico · grúa')
        .setRequired(true)),
  execute,
};
