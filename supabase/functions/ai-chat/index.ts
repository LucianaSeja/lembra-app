import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é o Assistente Lembra — um assistente pessoal inteligente, simpático e direto ao ponto, integrado ao app Lembra (organizador de lembretes, compromissos e agenda).

PERSONALIDADE:
- Fale sempre em português brasileiro, de forma natural e calorosa (não robótica)
- Seja conciso: prefira respostas curtas e claras, sem enrolação
- Use emojis com moderação para deixar a resposta mais amigável
- Quando listar itens, use bullet points simples (•) ou numeração
- Nunca use asteriscos duplos (**texto**) — use texto simples ou listas

CAPACIDADES:
- Responder perguntas sobre lembretes e compromissos do usuário
- Resumir o que tem hoje, amanhã ou na semana
- Ajudar a organizar tarefas por prioridade ou categoria
- Sugerir ações (ex: "Você tem 3 lembretes atrasados")
- Abrir links de e-mail ou agenda quando solicitado

REGRAS:
- Sempre use os dados reais do contexto fornecido (lembretes, eventos, datas)
- Se não souber algo, diga claramente ao invés de inventar
- Não repita o contexto inteiro — responda de forma objetiva
- Se o usuário pedir para "trazer o link" de algo, forneça o link direto
- Data de hoje e amanhã estão sempre no contexto — use-as corretamente
- Responda SEMPRE em português, mesmo que a pergunta seja em outro idioma`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mensagem, historico = [], contexto = {}, sistema } = body;

    // Usar system prompt do cliente se fornecido, senão usar o padrão
    const systemContent = sistema || SYSTEM_PROMPT;

    // Montar contexto como mensagem de sistema adicional
    let contextMsg = "";
    if (contexto.lembretes || contexto.eventos) {
      const lembretes = contexto.lembretes || [];
      const eventos = contexto.eventos || [];
      const hoje = contexto.hoje || new Date().toISOString().split("T")[0];
      const amanha = contexto.amanha || "";

      const lemPendentes = lembretes.filter((r: any) => !r.done);
      const lemHoje = lemPendentes.filter((r: any) => r.date === hoje);
      const evtHoje = eventos.filter((e: any) => {
        const d = e.start?.dateTime
          ? e.start.dateTime.split("T")[0]
          : e.start?.date || "";
        return d === hoje;
      });

      contextMsg = `\n\nCONTEXTO ATUAL DO USUÁRIO:
Data de hoje: ${hoje}
Data de amanhã: ${amanha}
Lembretes pendentes hoje (${lemHoje.length}): ${lemHoje.map((r: any) => `"${r.title}"${r.time ? " às " + r.time : ""}`).join(", ") || "nenhum"}
Total de lembretes pendentes: ${lemPendentes.length}
Eventos do calendário hoje (${evtHoje.length}): ${evtHoje.map((e: any) => `"${e.summary}"${e.start?.dateTime ? " às " + new Date(e.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : ""}`).join(", ") || "nenhum"}
Total de eventos no calendário: ${eventos.length}`;
    }

    // Montar histórico com system prompt no início
    const messages = [
      { role: "system", content: systemContent + contextMsg },
      ...historico.slice(-10), // últimas 10 mensagens
      { role: "user", content: mensagem },
    ];

    // Chamar OpenAI
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ erro: "OPENAI_API_KEY não configurada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", errText);
      return new Response(
        JSON.stringify({ erro: `OpenAI retornou ${openaiRes.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    const openaiData = await openaiRes.json();
    const resposta = openaiData.choices?.[0]?.message?.content || "Não consegui gerar uma resposta.";

    return new Response(
      JSON.stringify({ resposta }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro na Edge Function ai-chat:", err);
    return new Response(
      JSON.stringify({ erro: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
