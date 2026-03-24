

## Plano: Reduzir Volume de Mensagens do Agente

### Problemas Identificados

Olhando as últimas conversas, o lead manda "tenho interesse" e recebe:
1. Fluxo automático: 3 mensagens (atenção, áudio, fornecedores com link)
2. IA: mais 3 mensagens (re-explica tudo que o fluxo já disse, com ---SPLIT---)

**Total: 6 mensagens para 1 pergunta.** O lead é bombardeado.

Além disso, a IA ainda termina com "Se tiver mais alguma dúvida, é só falar! 😊" — exatamente o que está proibido no prompt.

### Causa Raiz

1. **`ai-engine.ts`**: A regra de SPLIT é agressiva demais — "mais de 3 linhas → SPLIT" faz quase toda resposta virar múltiplas mensagens
2. **`ai-engine.ts`**: Não há instrução para a IA reconhecer que o fluxo JÁ apresentou o produto (ela vê "[FLUXO AUTOMÁTICO]" no histórico mas não sabe que deve ser breve depois disso)
3. **Prompt do agente**: Permite "até 6 linhas com ---SPLIT---" para apresentações — isso gera 3 mensagens separadas
4. **Princípios**: Falta regra de brevidade pós-fluxo

### Mudanças

**1. `supabase/functions/_shared/ai-engine.ts`**
- Adicionar princípio: "Se o histórico contém [FLUXO AUTOMÁTICO], o produto JÁ foi apresentado. Seja BREVE — responda apenas o que o lead perguntou, sem repetir informações do fluxo."
- Tornar SPLIT menos agressivo: mudar de "mais de 3 linhas" para "mais de 5 linhas", máximo 2 partes (não 3+)
- Reforçar: "NUNCA termine com frases genéricas de encerramento"

**2. Banco: `agents.prompt` (MagoFlix)**
- Reduzir limite de apresentação de "até 6 linhas com ---SPLIT---" para "até 4 linhas, sem SPLIT para apresentações"
- Reforçar: "Se o fluxo já apresentou o produto, NÃO re-apresente. Pergunte o que o lead quer saber."

### Resultado Esperado
- Lead manda "tenho interesse" → Fluxo envia 3 mensagens → IA envia **1 mensagem curta** tipo "E aí, ouviu o áudio? Alguma dúvida sobre a lista?" em vez de re-explicar tudo
- Respostas da IA em no máximo 2 mensagens (SPLIT só para respostas realmente longas)

