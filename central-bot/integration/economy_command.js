/* ============================================================
   ECONOMIA · comandos de Discord para Houston RP
   ------------------------------------------------------------
   Hablan con LA MISMA base de datos que la website:
     economy                  → saldo / total ganado / recompensa
     economy_adjustments      → auditoria de cada movimiento
     hrp_claim_welcome_reward → RPC atomica de los $300 de bienvenida
   No usa canal restringido: funcionan en cualquier canal.
   ============================================================ */
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://qqgtroxrkccftlrpqwsk.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  "sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H";

const WELCOME_REWARD = 300;

async function rest(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: body ? "return=representation" : "return=minimal",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status} ${txt.slice(0, 160)}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : null;
}

export async function getWallet(discordId) {
  const rows = await rest(
    `/economy?discord_id=eq.${encodeURIComponent(discordId)}` +
      `&select=balance,total_earned,welcome_reward_claimed&limit=1`
  );
  const r = rows && rows[0];
  return {
    balance: Number((r && r.balance) || 0),
    totalEarned: Number((r && r.total_earned) || 0),
    claimed: !!(r && r.welcome_reward_claimed),
    exists: !!r,
  };
}

export async function logAdjustment(discordId, username, amount, reason, createdBy) {
  await rest(`/economy_adjustments`, {
    method: "POST",
    body: {
      discord_id: String(discordId),
      username: String(username || "").slice(0, 100),
      amount: Number(amount),
      reason: String(reason || "").slice(0, 200),
      created_by: String(createdBy || "bot").slice(0, 100),
    },
  });
}

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-AR")}`;
}

function walletEmbed({ name, avatar, balance, totalEarned, self }) {
  return new EmbedBuilder()
    .setColor(0x34d399)
    .setAuthor({ name: `Cartera de ${name}`, iconURL: avatar })
    .addFields(
      { name: "💵 Saldo disponible", value: `\`\`\`${money(balance)}\`\`\``, inline: true },
      { name: "📈 Ganado histórico", value: `\`\`\`${money(totalEarned)}\`\`\``, inline: true }
    )
    .setFooter({ text: self ? "Tu saldo de Houston RP" : "Saldo sincronizado con la website" })
    .setTimestamp();
}

/* ── /ver_cartera ── */
async function cmdVerCartera(interaction) {
  const target = interaction.options.getUser("usuario") || interaction.user;
  await interaction.deferReply({ flags: 64 });
  const w = await getWallet(target.id);
  await interaction.editReply({
    embeds: [
      walletEmbed({
        name: target.username,
        avatar: target.displayAvatarURL({ size: 64 }),
        balance: w.balance,
        totalEarned: w.totalEarned,
        self: target.id === interaction.user.id,
      }),
    ],
  });
}

/* ── /pagar ── */
async function cmdPagar(interaction) {
  const target = interaction.options.getUser("usuario");
  const amount = Math.floor(interaction.options.getInteger("monto"));
  await interaction.deferReply({ flags: 64 });

  if (!amount || amount <= 0)
    return interaction.editReply({ content: "❌ El monto debe ser mayor a 0." });
  if (target.bot)
    return interaction.editReply({ content: "❌ No se le puede pagar a un bot." });
  if (target.id === interaction.user.id)
    return interaction.editReply({ content: "❌ No podés pagarte a vos mismo." });

  const from = await getWallet(interaction.user.id);
  if (from.balance < amount)
    return interaction.editReply({
      content: `❌ No tenés saldo suficiente. Disponés de **${money(from.balance)}**.`,
    });

  // Resta del emisor y confirmá que no quedó en negativo.
  await rest(`/economy?discord_id=eq.${interaction.user.id}`, {
    method: "PATCH",
    body: { balance: from.balance - amount, updated_at: new Date().toISOString() },
  });
  const afterFrom = await getWallet(interaction.user.id);
  if (afterFrom.balance > from.balance - amount) {
    // Alguien más movió el saldo entre medias: revertimos.
    await rest(`/economy?discord_id=eq.${interaction.user.id}`, {
      method: "PATCH",
      body: { balance: afterFrom.balance + amount },
    });
    return interaction.editReply({ content: "⚠️ Tu saldo cambió a último momento. Probá de nuevo." });
  }

  // Suma al receptor (crea la fila si no existe).
  const to = await getWallet(target.id);
  if (to.exists) {
    await rest(`/economy?discord_id=eq.${target.id}`, {
      method: "PATCH",
      body: { balance: to.balance + amount, updated_at: new Date().toISOString() },
    });
  } else {
    await rest(`/economy`, {
      method: "POST",
      body: { discord_id: target.id, balance: amount, updated_at: new Date().toISOString() },
    });
  }

  await logAdjustment(
    interaction.user.id, interaction.user.username, -amount,
    `Transferencia a ${target.username}`, "discord:/pagar"
  ).catch(() => {});
  await logAdjustment(
    target.id, target.username, amount,
    `Recibido de ${interaction.user.username}`, "discord:/pagar"
  ).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle("💸 Transferencia realizada")
    .setDescription(
      `**${interaction.user.username}** → **${target.username}**\n` +
      `Monto: **${money(amount)}**\n` +
      `Tu saldo restante: **${money(afterFrom.balance)}**`
    )
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

/* ── /reclamar ── */
async function cmdReclamar(interaction) {
  await interaction.deferReply({ flags: 64 });
  const r = await rest(`/rpc/hrp_claim_welcome_reward`, {
    method: "POST",
    body: { p_discord_id: String(interaction.user.id) },
  });
  const status = r && (r.status || (Array.isArray(r) && r[0] && r[0].status));

  if (status === "already_claimed") {
    const w = await getWallet(interaction.user.id);
    return interaction.editReply({
      content: `⚠️ Ya reclamaste tu recompensa de bienvenida. Tu saldo actual es **${money(w.balance)}**.`,
    });
  }
  const w = await getWallet(interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(0xfbbf24)
    .setTitle("🎉 Recompensa reclamada")
    .setDescription(`Sumamos **${money(WELCOME_REWARD)}** a tu cartera.`)
    .addFields({ name: "💵 Nuevo saldo", value: `\`\`\`${money(w.balance)}\`\`\`` })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

/* ── registro + despacho ── */
export const economyCommands = [
  new SlashCommandBuilder()
    .setName("ver_cartera")
    .setDescription("Mirá tu saldo de Houston RP (el mismo de la website)")
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Ver la cartera de otro usuario").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("pagar")
    .setDescription("Transferí dinero a otro usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Quién recibe").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("monto").setDescription("Cuánto pagar").setRequired(true).setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("reclamar")
    .setDescription(`Reclamá tu recompensa de bienvenida (${money(WELCOME_REWARD)})`),
].map((c) => c.toJSON());

const HANDLERS = {
  ver_cartera: cmdVerCartera,
  pagar: cmdPagar,
  reclamar: cmdReclamar,
};

export function isEconomyCommand(name) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

export async function handleEconomyInteraction(interaction) {
  const fn = HANDLERS[interaction.commandName];
  if (!fn) return false;
  try {
    await fn(interaction);
  } catch (e) {
    console.error(`[economia] /${interaction.commandName} error:`, e.message);
    const msg = "⚠️ No se pudo consultar la cartera. Probá de nuevo en unos segundos.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg });
      else await interaction.reply({ content: msg, flags: 64 });
    } catch (_) {}
  }
  return true;
}

export default { economyCommands, handleEconomyInteraction, isEconomyCommand, getWallet };
