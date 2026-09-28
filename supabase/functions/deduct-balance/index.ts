import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const { discord_id, amount } = await req.json();

  const { data, error } = await supabase
    .from("economy")
    .select("balance")
    .eq("discord_id", discord_id)
    .single();

  if (error || !data)
    return new Response(JSON.stringify({ error: "Usuario no encontrado" }), {
      status: 404,
    });
  if (data.balance < amount)
    return new Response(JSON.stringify({ error: "Saldo insuficiente" }), {
      status: 400,
    });

  const newBalance = data.balance - amount;
  const { error: updateError } = await supabase
    .from("economy")
    .upsert({
      discord_id,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    });

  if (updateError)
    return new Response(JSON.stringify({ error: "Error al actualizar" }), {
      status: 500,
    });

  return new Response(
    JSON.stringify({ success: true, new_balance: newBalance }),
    { status: 200 }
  );
});