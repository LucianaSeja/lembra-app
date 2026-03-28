# Contexto do Projeto: Lembra-App

Este documento fornece uma visão geral completa e atualizada do projeto Lembra-App, projetado para ser consumido por assistentes de IA (como o Claude Code ou Manus) para facilitar a manutenção, refatoração e adição de novas funcionalidades.

## 1. Visão Geral do Projeto

O Lembra-App é um aplicativo web progressivo (PWA) focado em produtividade, gerenciamento de lembretes e integração de agendas. Ele permite aos usuários criar tarefas, categorizá-las, anexar fotos, e sincronizar compromissos bidirecionalmente com o Google Agenda e o Microsoft Outlook. O app também conta com um Assistente de IA integrado capaz de responder perguntas sobre a agenda do usuário e ajudar na criação de lembretes.

O aplicativo foi construído com uma arquitetura monolítica no frontend (HTML/CSS/JS em um único arquivo principal) para facilitar o deploy estático, apoiado por um backend serverless no Supabase (Edge Functions) para integrações seguras.

## 2. Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (variáveis nativas, sem frameworks externos), JavaScript Vanilla (ES6+).
- **PWA:** Service Worker (`sw.js`) para cache offline e `manifest.json` para instalação.
- **Armazenamento Local:** `localStorage` para persistência de dados offline (lembretes, categorias, configurações de integração).
- **Backend / BaaS:** Supabase (PostgreSQL para backup na nuvem, Edge Functions em Deno para integrações).
- **Autenticação:** Sistema de login próprio simples (armazenado no localStorage e espelhado no Supabase).
- **Integrações Externas:**
  - **Google Agenda:** Via Google Identity Services e Google Calendar API.
  - **Microsoft Outlook:** Via MSAL.js (Microsoft Authentication Library) e Microsoft Graph API. Suporta múltiplas contas (pessoal e corporativa).
  - **Assistente IA:** Groq API (modelo llama3-8b-8192) acessado via Supabase Edge Function.
- **Hospedagem:** Vercel (deploy automático via GitHub).

## 3. Estrutura de Arquivos

A raiz do repositório contém vários arquivos, incluindo backups e versões legadas. A fonte da verdade atual é composta pelos seguintes arquivos:

- `index.html`: O núcleo do aplicativo. Contém todo o markup, estilos CSS inline e a lógica JavaScript do frontend (mais de 3.500 linhas).
- `sw.js`: Service Worker atual. Responsável pelo cache estático. **Sempre incremente a versão da constante `CACHE` ao modificar o app.**
- `manifest.json`: Configuração do PWA.
- `icon.svg`: Ícone vetorial do aplicativo.
- `supabase-config.js`: Credenciais públicas do Supabase (`SUPABASE_URL` e `SUPABASE_ANON_KEY`).
- `supabase/functions/sync-calendar/index.ts`: Edge Function em Deno responsável por intermediar a comunicação com as APIs do Google e Outlook de forma segura, contornando problemas de CORS e processando fusos horários.
- `supabase/functions/ai-chat/index.ts`: Edge Function em Deno que recebe o contexto do usuário (lembretes e eventos) e se comunica com a API do Groq para gerar respostas do Assistente IA.

> **Aviso Importante sobre Arquivos Legados:** A raiz do repositório contém vários arquivos como `indexNOVO.html`, `index-v5.html`, `indexok.html`, `swNOVO.js`, `sw24.js`, etc. Estes são backups ou snapshots antigos e devem ser ignorados. Todas as alterações devem ser feitas exclusivamente no `index.html` e `sw.js` principais.

## 4. Funcionalidades Principais

1. **Gestão de Lembretes:** Criação, edição, exclusão, marcação de conclusão, categorização (com cores e emojis) e anexo de fotos (armazenadas em base64 no localStorage).
2. **Sincronização de Agenda:**
   - Conexão com Google Agenda.
   - Conexão com Outlook (Conta 1 - Pessoal).
   - Conexão com Outlook (Conta 2 - Corporativa/Azure).
   - Exibição unificada de compromissos no dashboard "Meus Compromissos".
3. **Assistente de IA:** Chatbot integrado que conhece os lembretes e eventos da agenda do usuário, capaz de responder perguntas contextuais e sugerir ações. Suporta entrada por voz (Web Speech API).
4. **Modo Offline:** Funciona sem internet graças ao Service Worker, sincronizando com o Supabase quando a conexão é restabelecida.
5. **Temas e Design System:** Suporte a tema claro e escuro (padrão). Utiliza fonte Inter, cores com contraste WCAG AA e hierarquia visual baseada em elevação (sombras e bordas).
6. **Navegação Responsiva:** Menu lateral em formato "accordion" (colapsável) no desktop e barra de navegação inferior no mobile.

## 5. Histórico de Bugs e Correções Recentes

As seguintes correções críticas foram aplicadas recentemente e devem ser mantidas em futuras refatorações:

- **Deduplicação de Eventos:** Eventos de diferentes fontes (Google, Outlook, Corp) com o mesmo título não devem ser removidos. A deduplicação (`calItemsDedup`) agora exige que o título, horário **e a fonte** sejam idênticos.
- **Lembretes na Agenda:** Lembretes marcados com `inAgenda=true` aparecem na seção "AGENDA" da tela de compromissos. Para evitar duplicatas, se um lembrete `inAgenda` tiver o mesmo título e horário de um evento sincronizado do calendário, o evento do calendário é suprimido na exibição.
- **Fuso Horário do Outlook (+3h):** Contas Microsoft 365 corporativas retornam datas sem o sufixo `Z` (UTC), o que fazia o JavaScript local interpretar erroneamente e adicionar 3 horas. A Edge Function `sync-calendar` foi atualizada para identificar datas sem fuso e tratá-las como horário local de Brasília.
- **Erro HTTP 400 no Google Agenda:** Causado por tokens expirados. Foi implementada uma lógica de renovação silenciosa (`silentReauthGoogle`) usando `google.accounts.oauth2.initTokenClient` antes de buscar eventos.
- **Conflito de Múltiplas Contas Outlook:** A segunda conta do Outlook falhava ao conectar. Foi resolvido instanciando um segundo objeto MSAL (`msalApp2`) usando `sessionStorage` em vez de `localStorage` para isolar o estado da autenticação da conta principal.
- **Assistente IA sem Contexto:** O fallback local do assistente IA (quando a API falhava) não mantinha o histórico da conversa. O `processLocalAI` foi atualizado para analisar o histórico recente.

## 6. Estrutura de Dados (LocalStorage)

O estado da aplicação é mantido no `localStorage` usando as seguintes chaves principais (onde `{email}` é o email do usuário logado):

- `lembra_session`: Dados do usuário logado.
- `lembra_v4_{email}`: Array de objetos de lembretes.
- `lembra_cats_{email}`: Array de categorias personalizadas.
- `lembra_int_{email}`: Objeto de integrações contendo tokens e cache de eventos (`calendarEvents`).

## 7. Instruções de Deploy e Manutenção

1. **Edição:** Modifique apenas `index.html`, `sw.js` ou as Edge Functions em `supabase/functions/`.
2. **Cache:** Sempre que modificar o `index.html` ou recursos estáticos, incremente a constante `CACHE` no arquivo `sw.js` (ex: de `lembra-v42` para `lembra-v43`) e atualize a string de query no registro do service worker no final do `index.html` (`/sw.js?v=43`).
3. **Deploy Frontend:** O repositório está conectado ao Vercel. Qualquer push para a branch `main` no GitHub aciona um deploy automático.
4. **Deploy Edge Functions:** As funções do Supabase devem ser atualizadas via CLI do Supabase:
   ```bash
   supabase functions deploy sync-calendar
   supabase functions deploy ai-chat
   ```
   *(Nota: O deploy das funções não é automático via Vercel, requer ação manual no Supabase CLI).*
