import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || "";
const GUILD_ID = Deno.env.get("GUILD_ID") || "1285846827463344209";
const POLICE_ROLE_ID = Deno.env.get("POLICE_ROLE_ID") || "1431255106212335686";
const DISPATCH_ROLE_ID = Deno.env.get("DISPATCH_ROLE_ID") || "1502940318092366056";
const MANAGE_ROLE_ID = Deno.env.get("MANAGE_ROLE_ID") || "1502940172348690482";
const DEV_ROLE_ID = Deno.env.get("DEV_ROLE_ID") || "1425697670495862844";
const FOUNDATION_ROLE_ID = Deno.env.get("FOUNDATION_ROLE_ID") || "1430728225423884419";
const DEPT_ROLES = [
  "1364729666128314418", // hpd
  "1364729668569137172", // hcso
  "1310839129252298802", // ice
  "1310839295988334612", // tph
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function getMemberRoles(discordId: string): Promise<string[] | null> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
  );
  if (!res.ok) return null;
  const m = await res.json();
  return m.roles || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS, status: 204 });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!DISCORD_BOT_TOKEN || !SUPABASE_SERVICE_KEY) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    const { caller_token, target_discord_id } = await req.json();
    if (!caller_token || !target_discord_id) {
      return json({ ok: false, error: "Missing parameters" }, 400);
    }

    // ── 1) IDENTIDAD REAL DEL QUE PIDE (no se confia en el navegador) ──
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${caller_token}` },
    });
    if (!meRes.ok) return json({ ok: false, error: "Invalid Discord session" }, 401);
    const me = await meRes.json();
    const callerId = me.id as string;

    // ── 2) EL QUE PIDE DEBE TENER ROL DE ADMIN ──
    const callerRoles = await getMemberRoles(callerId);
    if (!callerRoles) return json({ ok: false, error: "Caller not in guild" }, 403);
    const isAdmin = callerRoles.some((r) =>
      r === MANAGE_ROLE_ID || r === DEV_ROLE_ID || r === FOUNDATION_ROLE_ID
    );
    if (!isAdmin) return json({ ok: false, error: "Not authorized" }, 403);

    // ── 3) NO DEJARSE ECHAR A SI MISMO NI A UN ADMIN ──
    if (target_discord_id === callerId) {
      return json({ ok: false, error: "You cannot fire yourself" }, 400);
    }
    const targetRoles = await getMemberRoles(target_discord_id);
    const targetIsAdmin = (targetRoles || []).some((r) =>
      r === MANAGE_ROLE_ID || r === DEV_ROLE_ID || r === FOUNDATION_ROLE_ID
    );
    if (targetIsAdmin) {
      return json({ ok: false, error: "Cannot fire an administrator" }, 403);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const removedRoles: string[] = [];

    // ── 4) QUITAR ROLES DE DISCORD (policia, dispatch y departamentos) ──
    const toRemove = [POLICE_ROLE_ID, DISPATCH_ROLE_ID, ...DEPT_ROLES];
    for (const roleId of toRemove) {
      if (!(targetRoles || []).includes(roleId)) continue;
      const del = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${target_discord_id}/roles/${roleId}`,
        { method: "DELETE", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
      );
      if (del.ok || del.status === 204) removedRoles.push(roleId);
    }

    // ── 5) BORRAR RANGO (solo servidor: la tabla no permite DELETE al cliente) ──
    const { error: rankErr } = await sb
      .from("rank_members")
      .delete()
      .eq("discord_id", target_discord_id);
    if (rankErr) console.error("rank_members delete:", rankErr.message);

    // ── 6) BORRAR ACCESO AL MDT ──
    const { error: pmErr } = await sb
      .from("police_members")
      .delete()
      .eq("discord_id", target_discord_id);
    if (pmErr) console.error("police_members delete:", pmErr.message);

    // ── 7) REGISTRO DE AUDITORIA (no borra nada, solo deja constancia) ──
    try {
      await sb.from("rank_history").insert({
        discord_id: target_discord_id,
        username: "",
        department: "",
        old_rank: "fired",
        old_rank_label: "Despedido",
        new_rank: "",
        new_rank_label: "",
        changed_by: callerId,
        changed_by_name: me.username || "admin",
      });
    } catch (_) {}

    // NOTA: el personaje (nombre IC) NO se toca. Las horas tampoco.
    return json({
      ok: true,
      target: target_discord_id,
      removed_roles: removedRoles.length,
      fired_by: callerId,
    });
  } catch (err) {
    console.error("fire-officer error:", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});
