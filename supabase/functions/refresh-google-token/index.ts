import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, code, userEmail, redirectUri } = body;

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "126747406308-eestcpeb8n5jhmt7t7vfpfnjq60jo5k3.apps.googleusercontent.com";
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!GOOGLE_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ erro: "GOOGLE_CLIENT_SECRET não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── AÇÃO: trocar authorization code por tokens ──────────────────────────
    if (action === "exchange_code") {
      if (!code || !userEmail || !redirectUri) {
        return new Response(
          JSON.stringify({ erro: "Parâmetros obrigatórios: code, userEmail, redirectUri" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return new Response(
          JSON.stringify({ erro: `Google token exchange falhou: ${err}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const tokens = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokens;

      if (!access_token) {
        return new Response(
          JSON.stringify({ erro: "Google não retornou access_token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Salvar refresh_token no Supabase (tabela google_tokens)
      if (refresh_token) {
        const { error: upsertError } = await supabase
          .from("google_tokens")
          .upsert(
            { user_email: userEmail, refresh_token, updated_at: new Date().toISOString() },
            { onConflict: "user_email" }
          );
        if (upsertError) {
          console.error("Erro ao salvar refresh_token:", upsertError.message);
        }
      }

      return new Response(
        JSON.stringify({
          access_token,
          expires_in: expires_in || 3600,
          has_refresh_token: !!refresh_token,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── AÇÃO: renovar access_token usando refresh_token ─────────────────────
    if (action === "refresh") {
      if (!userEmail) {
        return new Response(
          JSON.stringify({ erro: "Parâmetro obrigatório: userEmail" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Buscar refresh_token do banco
      const { data: tokenRow, error: fetchError } = await supabase
        .from("google_tokens")
        .select("refresh_token")
        .eq("user_email", userEmail)
        .single();

      if (fetchError || !tokenRow?.refresh_token) {
        return new Response(
          JSON.stringify({ erro: "refresh_token não encontrado — usuário precisa reconectar o Google" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: tokenRow.refresh_token,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) {
        const err = await refreshRes.text();
        // Se o refresh_token foi revogado, remover do banco
        if (refreshRes.status === 400 || refreshRes.status === 401) {
          await supabase.from("google_tokens").delete().eq("user_email", userEmail);
        }
        return new Response(
          JSON.stringify({ erro: `Google refresh falhou: ${err}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const refreshData = await refreshRes.json();
      const { access_token, expires_in } = refreshData;

      return new Response(
        JSON.stringify({
          access_token,
          expires_in: expires_in || 3600,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ erro: "action inválida. Use exchange_code ou refresh" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ erro: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
