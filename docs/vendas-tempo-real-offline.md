# Vendas em tempo real e modo offline — v52

## Componentes
- `js/heligrafes-sales-live.js`: fila IndexedDB, sincronização idempotente, painel central e alertas.
- `service-worker.js`: cache da aplicação e dos recursos externos (scripts, estilos e fontes) depois de uma primeira utilização online.
- `js/heligrafes-cloud.js`: recuperação da identidade previamente autenticada quando a rede está indisponível.
- `database/pos_sales_events.sql`: estrutura SQL e políticas RLS aplicadas no Supabase.

## Comportamento
1. Uma venda confirmada é mantida no armazenamento local existente e colocada na fila IndexedDB.
2. Quando existe Internet, a fila envia o evento para `public.pos_sales_events`.
3. A chave única `(organization_id, local_sale_id)` impede duplicação durante reenvios.
4. O painel administrativo lê apenas os locais permitidos pelas políticas RLS e recebe novos eventos via Supabase Realtime.
5. Alertas sonoros e notificações do navegador são activados pelo utilizador no painel.

## Pré-requisitos para utilização offline
- O utilizador deve iniciar sessão online pelo menos uma vez neste dispositivo.
- A aplicação deve ser aberta online para instalar o Service Worker; depois, actualizar a página uma vez online para cachear os recursos CDN usados pela interface.
- O navegador deve suportar IndexedDB e Service Workers.
- A fila fica neste dispositivo/navegador. Limpar os dados do site pode apagar vendas ainda não sincronizadas.

## Limites da primeira entrega
- O evento de venda é guardado em JSONB na tabela `pos_sales_events`; ainda não é convertido em registos normalizados de `orders`, `order_items` e `payments`.
- A sincronização offline não reserva stock entre locais. Conflitos de stock devem ser revistos após reconexão.
- A autenticação, a sincronização e as notificações precisam de ensaio funcional em navegador com contas dos três locais antes da utilização operacional.
