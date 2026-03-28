# Lembra App

O **Lembra** é um aplicativo web progressivo (PWA) focado em produtividade, gerenciamento de lembretes e integração inteligente de agendas. Ele permite aos usuários criar tarefas, categorizá-las, anexar fotos e sincronizar compromissos bidirecionalmente com o Google Agenda e o Microsoft Outlook.

O aplicativo conta com um **Assistente de IA integrado** capaz de responder perguntas sobre a agenda do usuário e ajudar na criação de lembretes por texto ou voz.

## 🚀 Funcionalidades Principais

- **Gestão de Lembretes:** Criação, edição, exclusão, marcação de conclusão, categorização (com cores e emojis) e anexo de fotos.
- **Dashboard "Meus Compromissos":** Visão unificada e moderna de todos os seus eventos.
- **Sincronização de Agendas:**
  - Google Agenda (Gmail)
  - Microsoft Outlook (Conta Pessoal)
  - Microsoft Outlook (Conta Corporativa / Office 365)
- **Assistente de IA:** Chatbot integrado com contexto da sua agenda, suportando comandos de voz via Web Speech API.
- **Modo Offline (PWA):** Funciona sem internet graças ao Service Worker, sincronizando dados quando a conexão é restabelecida.
- **Design System Moderno:** Interface responsiva com suporte a Dark/Light mode, tipografia Inter, alta legibilidade (WCAG AA) e navegação otimizada para mobile.

## 🛠️ Arquitetura e Tecnologias

O projeto utiliza uma arquitetura monolítica no frontend para facilitar o deploy estático, apoiada por um backend serverless para integrações seguras.

- **Frontend:** HTML5, CSS3 (variáveis nativas, sem frameworks), JavaScript Vanilla (ES6+).
- **PWA:** Service Worker (`sw.js`) para cache e `manifest.json` para instalação.
- **Armazenamento:** `localStorage` para persistência de dados offline.
- **Backend / BaaS:** Supabase (PostgreSQL e Edge Functions em Deno).
- **Autenticação:** Sistema próprio espelhado no Supabase, com integrações OAuth para Google e Microsoft.
- **IA:** Groq API (modelo Llama 3) acessada via Supabase Edge Functions.
- **Hospedagem:** Vercel (Frontend) e Supabase (Backend).

## 📂 Estrutura do Projeto

A fonte da verdade do projeto é composta pelos seguintes arquivos principais:

- `index.html`: O núcleo do aplicativo. Contém todo o markup, estilos CSS e a lógica JavaScript do frontend.
- `sw.js`: Service Worker responsável pelo cache estático e funcionamento offline.
- `manifest.json`: Configuração do PWA.
- `supabase-config.js`: Credenciais públicas do Supabase.
- `supabase/functions/`: Diretório contendo as Edge Functions (`sync-calendar` e `ai-chat`).

> **Nota:** Arquivos com sufixos como `NOVO`, `ok`, `fix` ou versões antigas na raiz do repositório são backups legados e não devem ser utilizados no fluxo principal.

## 💻 Como Executar Localmente

Como o frontend é construído em HTML/JS puro, você pode executá-lo usando qualquer servidor HTTP estático simples:

```bash
# Usando Python
python -m http.server 8000

# Usando Node.js (http-server)
npx http-server -p 8000
```

Acesse `http://localhost:8000` no seu navegador.

## 🚀 Deploy

- **Frontend:** O deploy é feito automaticamente na Vercel a cada push para a branch `main`.
- **Edge Functions:** Devem ser atualizadas manualmente via Supabase CLI:
  ```bash
  supabase functions deploy sync-calendar
  supabase functions deploy ai-chat
  ```

## 🎨 Design System

O aplicativo utiliza um design system focado em acessibilidade e hierarquia visual:
- **Tipografia:** Inter (primária) e Fraunces (títulos de destaque).
- **Cores:** Paleta otimizada para contraste WCAG AA em ambos os temas (Dark/Light).
- **Identidade Visual das Integrações:**
  - Google: Vermelho (`#EF4444`)
  - Outlook Pessoal: Azul (`#3B82F6`)
  - Outlook Corporativo: Ciano (`#22D3EE`)

## 📝 Licença

Este projeto é de uso privado e confidencial.
