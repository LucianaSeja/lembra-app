import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Retorna data/hora no fuso de Brasília (UTC-3) no formato YYYY-MM-DD
function toBrasiliaDate(isoString: string): string {
  const d = new Date(isoString);
  // Ajusta para UTC-3
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().split("T")[0];
}

// Retorna HH:MM no fuso de Brasília
function toBrasiliaTime(isoString: string): string {
  const d = new Date(isoString);
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().substring(11, 16);
}

// Normaliza dateTime do Outlook para YYYY-MM-DDTHH:MM:SS no fuso de Brasília (UTC-3)
// Comportamento do Microsoft 365 corporativo:
//   - Com header Prefer: retorna com fuso explícito (ex: 2026-03-25T18:00:00-03:00)
//   - Sem header Prefer: retorna sem fuso (ex: 2026-03-25T18:00:00) = já é horário local
// Comportamento do Outlook pessoal (hotmail/live):
//   - Retorna com 'Z' (UTC) e precisa converter para BRT
function toBrasiliaDatetime(rawDatetime: string): string {
  if (!rawDatetime) return rawDatetime;
  // Se tem 'Z' no final = UTC explícito, converter para BRT
  if (rawDatetime.endsWith('Z')) {
    const d = new Date(rawDatetime);
    if (isNaN(d.getTime())) return rawDatetime;
    const offset = -3 * 60; // UTC-3 (Brasília)
    const local = new Date(d.getTime() + offset * 60000);
    return local.toISOString().replace('Z', '').substring(0, 19);
  }
  // Se tem offset explícito (+HH:MM ou -HH:MM), converter para BRT
  if (/[+-]\d{2}:\d{2}$/.test(rawDatetime)) {
    const d = new Date(rawDatetime);
    if (isNaN(d.getTime())) return rawDatetime;
    const offset = -3 * 60;
    const local = new Date(d.getTime() + offset * 60000);
    return local.toISOString().replace('Z', '').substring(0, 19);
  }
  // Sem indicador de fuso = Microsoft 365 corporativo já retornou no horário local
  // Não converter, apenas normalizar o formato
  return rawDatetime.substring(0, 19);
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
        const amanhaDate = new Date(agora);
        amanhaDate.setDate(amanhaDate.getDate() + 1);
        const amanhaStr = toBrasiliaDate(amanhaDate.toISOString());

        // calendarView usa UTC — passar intervalo em UTC que cobre o dia inteiro em Brasília
        // Brasília é UTC-3, então hoje 00:00 BRT = hoje 03:00 UTC
        // amanhã 23:59 BRT = depois de amanhã 02:59 UTC
        const startUTC = `${hojeStr}T03:00:00Z`;
        const endUTC = `${amanhaStr}T02:59:59Z`;

        const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startUTC)}&endDateTime=${encodeURIComponent(endUTC)}&$orderby=start/dateTime&$top=100&$select=id,subject,start,end,bodyPreview,organizer,isAllDay`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Prefer": `outlook.timezone="E. South America Standard Time"`,
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
          // Normalizar datas do Outlook para horário de Brasília (UTC-3)
          // Contas Microsoft 365 corporativas ignoram o header Prefer e retornam sem 'Z'
          // A função toBrasiliaDatetime trata ambos os casos (com e sem Z)
          const rawStart = e.start?.dateTime || "";
          const rawEnd = e.end?.dateTime || "";
          const startBRT = rawStart ? toBrasiliaDatetime(rawStart) : "";
          const endBRT = rawEnd ? toBrasiliaDatetime(rawEnd) : "";
          return {
            id: e.id,
            summary: e.subject || "(sem título)",
            start: { dateTime: startBRT || rawStart },
            end: { dateTime: endBRT || rawEnd },
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
