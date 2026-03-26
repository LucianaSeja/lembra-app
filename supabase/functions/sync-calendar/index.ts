import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Retorna data no fuso de Brasília (UTC-3) no formato YYYY-MM-DD
function toBrasiliaDate(isoString: string): string {
  const d = new Date(isoString);
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().split("T")[0];
}

// Normaliza qualquer dateTime do Outlook para UTC com sufixo Z
// O Microsoft Graph retorna datas em 3 formatos possíveis:
//   1. '2026-03-26T21:00:00Z'         → UTC explícito (hotmail/live pessoal)
//   2. '2026-03-26T18:00:00-03:00'    → offset explícito (com header Prefer)
//   3. '2026-03-26T21:00:00'          → sem fuso = UTC implícito (M365 corporativo sem Prefer)
// Estratégia: converter TUDO para UTC com Z, o frontend exibe em BRT via timeZone:'America/Sao_Paulo'
function toUTCWithZ(rawDatetime: string): string {
  if (!rawDatetime) return rawDatetime;

  // Caso 1: já tem Z = UTC explícito, retornar como está
  if (rawDatetime.endsWith("Z")) {
    const d = new Date(rawDatetime);
    return isNaN(d.getTime()) ? rawDatetime : d.toISOString();
  }

  // Caso 2: tem offset explícito (+HH:MM ou -HH:MM), converter para UTC
  if (/[+-]\d{2}:\d{2}$/.test(rawDatetime)) {
    const d = new Date(rawDatetime);
    return isNaN(d.getTime()) ? rawDatetime : d.toISOString();
  }

  // Caso 3: sem indicador de fuso = M365 corporativo retorna UTC sem Z
  // Adicionar Z para que o browser interprete como UTC
  return rawDatetime.substring(0, 19) + "Z";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { provider, token, action, event, accountId } = body;

    if (provider === "google") {
      if (action === "create" && event) {
        // Criar evento no Google Calendar
        const startDateTime = event.date && event.time
          ? `${event.date}T${event.time}:00`
          : event.date
          ? `${event.date}T09:00:00`
          : new Date().toISOString();

        const endDateTime = event.date && event.time
          ? `${event.date}T${addHour(event.time)}:00`
          : event.date
          ? `${event.date}T10:00:00`
          : new Date(Date.now() + 3600000).toISOString();

        const timezone = "America/Sao_Paulo";

        const googleEvent = {
          summary: event.title,
          description: event.desc || "",
          start: { dateTime: startDateTime, timeZone: timezone },
          end: { dateTime: endDateTime, timeZone: timezone },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 10 }],
          },
        };

        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(googleEvent),
          }
        );

        if (!res.ok) {
          const err = await res.text();
          return new Response(
            JSON.stringify({ erro: `Google Calendar: ${err}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const created = await res.json();
        return new Response(
          JSON.stringify({ sucesso: true, evento: created }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } else {
        // Buscar eventos do Google Calendar (hoje + amanhã) no fuso de Brasília
        const agora = new Date();
        const hojeStr = toBrasiliaDate(agora.toISOString());
        const amanhaDate = new Date(agora);
        amanhaDate.setDate(amanhaDate.getDate() + 1);
        const amanhaStr = toBrasiliaDate(amanhaDate.toISOString());

        // Usar offset explícito -03:00 para que a API do Google respeite o fuso
        const timeMin = `${hojeStr}T00:00:00-03:00`;
        const timeMax = `${amanhaStr}T23:59:59-03:00`;

        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const err = await res.text();
          return new Response(
            JSON.stringify({ erro: `Google Calendar: ${err}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const data = await res.json();
        // Google retorna datas com fuso explícito (ex: 2026-03-26T18:00:00-03:00)
        // Retornar como está — o frontend usa fmtTime com timeZone:'America/Sao_Paulo'
        const eventos = (data.items || []).map((e: any) => ({
          id: e.id,
          summary: e.summary || "(sem título)",
          start: e.start,
          end: e.end,
          description: e.description || "",
          origem: "Google Agenda",
          source: "google",
          accountId: accountId || "primary",
        }));

        return new Response(
          JSON.stringify({ eventos }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } else if (provider === "outlook") {
      if (action === "create" && event) {
        // Criar evento no Outlook Calendar
        const startDateTime = event.date && event.time
          ? `${event.date}T${event.time}:00`
          : event.date
          ? `${event.date}T09:00:00`
          : new Date().toISOString();

        const endDateTime = event.date && event.time
          ? `${event.date}T${addHour(event.time)}:00`
          : event.date
          ? `${event.date}T10:00:00`
          : new Date(Date.now() + 3600000).toISOString();

        const outlookEvent = {
          subject: event.title,
          body: { contentType: "Text", content: event.desc || "" },
          start: { dateTime: startDateTime, timeZone: "E. South America Standard Time" },
          end: { dateTime: endDateTime, timeZone: "E. South America Standard Time" },
          isReminderOn: true,
          reminderMinutesBeforeStart: 10,
        };

        const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(outlookEvent),
        });

        if (!res.ok) {
          const err = await res.text();
          return new Response(
            JSON.stringify({ erro: `Outlook: ${err}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const created = await res.json();
        return new Response(
          JSON.stringify({ sucesso: true, evento: created }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } else {
        // Buscar eventos do Outlook (hoje + amanhã) com fuso de Brasília correto
        const agora = new Date();
        const hojeStr = toBrasiliaDate(agora.toISOString());

        // Calcular depois de amanhã para cobrir amanhã inteiro em BRT
        // hoje 00:00 BRT = hoje 03:00 UTC → startUTC = hojeStr + T03:00:00Z
        // amanhã 23:59 BRT = depois de amanhã 02:59 UTC → endUTC = depoisAmanhaStr + T02:59:59Z
        const depoisAmanhaDate = new Date(agora);
        depoisAmanhaDate.setDate(depoisAmanhaDate.getDate() + 2);
        const depoisAmanhaStr = toBrasiliaDate(depoisAmanhaDate.toISOString());

        const startUTC = `${hojeStr}T03:00:00Z`;
        const endUTC = `${depoisAmanhaStr}T02:59:59Z`;

        // NÃO usar header Prefer: outlook.timezone para evitar comportamento inconsistente
        // Sem o header, o M365 corporativo retorna sem Z (UTC implícito)
        // A função toUTCWithZ adiciona Z em todos os casos para padronizar
        const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startUTC)}&endDateTime=${encodeURIComponent(endUTC)}&$orderby=start/dateTime&$top=100&$select=id,subject,start,end,bodyPreview,organizer,isAllDay`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const err = await res.text();
          return new Response(
            JSON.stringify({ erro: `Outlook: ${err}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const data = await res.json();
        const eventos = (data.value || []).map((e: any) => {
          // Normalizar todas as datas para UTC com Z
          // O frontend usa fmtTime com timeZone:'America/Sao_Paulo' para exibir corretamente
          const rawStart = e.start?.dateTime || "";
          const rawEnd = e.end?.dateTime || "";
          const startUTCNorm = rawStart ? toUTCWithZ(rawStart) : "";
          const endUTCNorm = rawEnd ? toUTCWithZ(rawEnd) : "";
          return {
            id: e.id,
            summary: e.subject || "(sem título)",
            start: { dateTime: startUTCNorm || rawStart },
            end: { dateTime: endUTCNorm || rawEnd },
            description: e.bodyPreview || "",
            origem: "Outlook",
            source: "outlook",
            accountId: accountId || "primary",
            isAllDay: e.isAllDay || false,
          };
        });

        return new Response(
          JSON.stringify({ eventos }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ erro: "Provider inválido. Use 'google' ou 'outlook'." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ erro: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = (h + 1) % 24;
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
