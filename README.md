# 🤖 Magoflix Agente IA

Plataforma de automação de vendas via WhatsApp com agente de Inteligência Artificial integrado.

## 🚀 Stack

- React 18 + TypeScript + Vite
- Supabase (PostgreSQL + Edge Functions + Auth)
- OpenAI GPT-4
- UazAPI (gateway WhatsApp)
- Meta Ads API
- Pepper Pagamentos
- Instagram / Threads

## ⚡ Rodando localmente

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves do Supabase

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: `http://localhost:8080`

## 🌐 Deploy na Vercel

O projeto está configurado para deploy automático na Vercel.

Toda vez que houver um `git push` na branch `main`, a Vercel faz o deploy automaticamente.

### Variáveis de Ambiente (configurar na Vercel)

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon/public do Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ID do projeto Supabase |

> Configure em: Vercel → Project → Settings → Environment Variables

## 📦 Scripts disponíveis

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build de produção
npm run preview  # Preview do build
npm run lint     # Linter
npm run test     # Testes
```

## 📁 Estrutura

```
src/
├── components/     # Componentes reutilizáveis
├── hooks/          # Custom hooks
├── integrations/   # Supabase client e tipos
├── lib/            # Helpers e utilitários
└── pages/          # 15 páginas da aplicação

supabase/
├── functions/      # 32 Edge Functions (Deno)
└── migrations/     # Migrações do banco de dados
```
