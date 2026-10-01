import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || "";
const GUILD_ID = Deno.env.get("GUILD_ID") || "1285846827463344209";
const MANAGE_ROLE_ID = Deno.env.get("MANAGE_ROLE_ID") || "1502940172348690482";
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
    const { action, discord_id, query } = await req.json();

    if (!DISCORD_BOT_TOKEN) {
      return corsResponse({ error: "Bot token not configured" }, 500);
    }

    if (action === "search") {
      if (!query || query.length < 1) {
        return corsResponse({ error: "Query must be at least 1 character" }, 400);
      }

      const allMembers = [];
      let after = null;
      let hasMore = true;

      while (hasMore) {
        let url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000`;
        if (after) url += `&after=${after}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        });

        if (!res.ok) {
          const errText = await res.text();
          return corsResponse({ error: `Discord API error ${res.status}: ${errText}` }, 500);
        }

        const members = await res.json();
        if (!members || members.length === 0) break;

        allMembers.push(...members);
        if (members.length < 1000) break;
        after = members[members.length - 1].user.id;
      }

      const q = query.toLowerCase();
      const filtered = allMembers
        .filter(m => m.user?.username?.toLowerCase().includes(q))
        .map(m => ({
          discord_id: m.user.id,
          username: m.user.username,
          global_name: m.user.global_name || null,
          avatar: m.user.avatar,
          roles: m.roles || [],
        }))
        .slice(0, 50);

      return corsResponse({ members: filtered, total: filtered.length });
    }

    if (action === "delete") {
      if (!discord_id) {
        return corsResponse({ error: "Missing discord_id" }, 400);
      }

      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return corsResponse({ error: "Supabase not configured" }, 500);
      }

      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const results = {};

      const tables = [
        { table: "characters", filter: "user_discord" },
        { table: "police_records", filter: "target_discord" },
        { table: "vehicles", filter: "owner_discord" },
        { table: "economy", filter: "discord_id" },
        { table: "police_shift_sessions", filter: "discord_id" },
        { table: "police_members", filter: "discord_id" },
        { table: "police_hours_adjustments", filter: "discord_id" },
        { table: "radio_messages", filter: "user_id" },
        { table: "radio_participants", filter: "user_id" },
      ];

      for (const { table, filter } of tables) {
        try {
          const { data, error, count } = await sb
            .from(table)
            .delete({ count: "exact" })
            .filter(filter, "eq", discord_id);

          if (error) {
            results[table] = { error: error.message };
          } else {
            const deletedCount = count ?? (data ? data.length : 0);
            results[table] = { deleted: deletedCount };
          }
        } catch (e) {
          results[table] = { error: e.message };
        }
      }

      return corsResponse({ success: true, results });
    }

    return corsResponse({ error: "Invalid action. Use 'search' or 'delete'." }, 400);
  } catch (err) {
    return corsResponse({ error: err.message }, 500);
  }
});
