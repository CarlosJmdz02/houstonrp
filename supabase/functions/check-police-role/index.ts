import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || "";
const GUILD_ID = Deno.env.get("GUILD_ID") || "1285846827463344209";
const POLICE_ROLE_ID = Deno.env.get("POLICE_ROLE_ID") || "1431255106212335686";
const MANAGE_ROLE_ID = Deno.env.get("MANAGE_ROLE_ID") || "1502940172348690482";
const DEV_ROLE_ID = Deno.env.get("DEV_ROLE_ID") || "1425697670495862844";
const FOUNDATION_ROLE_ID = Deno.env.get("FOUNDATION_ROLE_ID") || "1430728225423884419";

const DEPARTMENT_ROLES = {
  hpd: "1364729666128314418",
  hcso: "1364729668569137172",
  ice: "1310839129252298802",
  tph: "1310839295988334612",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { ...CORS_HEADERS, "Content-Length": "0" },
      status: 204,
    });
  }

  try {
    const { discord_id, username, role_id } = await req.json();
    if (!discord_id) {
      return corsResponse({ allowed: false, error: "Missing discord_id" }, 400);
    }

    if (!DISCORD_BOT_TOKEN) {
      return corsResponse({ allowed: false, error: "Bot token not configured" }, 500);
    }

    const targetRoleId = role_id || POLICE_ROLE_ID;

    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discord_id}`, {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Discord API error ${res.status}: ${errorText}`);
      return corsResponse({ allowed: false, error: "User not found in guild" });
    }

    const member = await res.json();
    const memberRoles = member.roles || [];

    const departments = {};
    let hasAnyDeptRole = false;
    for (const [key, roleId] of Object.entries(DEPARTMENT_ROLES)) {
      const hasRole = memberRoles.includes(roleId);
      departments[key] = hasRole;
      if (hasRole) hasAnyDeptRole = true;
    }

    const hasTargetRole = memberRoles.includes(targetRoleId) || false;
    const isSpecificCheck = !!role_id;

    let allowed: boolean;
    if (isSpecificCheck) {
      allowed = hasTargetRole;
      // Also accept the dev/foundation role when checking for the manage role
      if (!allowed && role_id === MANAGE_ROLE_ID) {
        allowed = memberRoles.includes(DEV_ROLE_ID) || memberRoles.includes(FOUNDATION_ROLE_ID) || false;
      }
    } else {
      allowed = hasTargetRole || hasAnyDeptRole;
    }

    if ((allowed || (role_id === MANAGE_ROLE_ID && (memberRoles.includes(DEV_ROLE_ID) || memberRoles.includes(FOUNDATION_ROLE_ID)))) && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await sb.rpc("add_police_member", {
          p_discord_id: discord_id,
          p_username: username || member.user?.username || "Unknown",
          p_role_id: targetRoleId,
        });
      } catch (dbErr) {
        console.error("Failed to save police member:", dbErr);
      }
    }

    return corsResponse({ allowed, departments, member: { username: member.user?.username } });
  } catch (err) {
    console.error("Edge Function error:", err);
    return corsResponse({ allowed: false, error: err.message }, 500);
  }
});
