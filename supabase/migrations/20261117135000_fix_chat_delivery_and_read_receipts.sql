-- Corrige o controlo de entrega do Chat Interno.
-- A função só marca como entregues mensagens privadas endereçadas ao utilizador autenticado.
-- As mensagens de grupo continuam a usar recibos individuais de leitura.

create or replace function public.heli_mark_my_chat_messages_delivered()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sessão não autenticada.';
  end if;

  update public.chat_messages
     set delivery_at = now()
   where recipient_id = v_user_id
     and sender_id <> v_user_id
     and delivery_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

revoke execute on function public.heli_mark_my_chat_messages_delivered() from public, anon;
grant execute on function public.heli_mark_my_chat_messages_delivered() to authenticated;

-- Recupera a data de entrega antiga somente quando existe leitura confirmada
-- pelo próprio destinatário. Não altera mensagens de grupo.
update public.chat_messages m
   set delivery_at = (
     select min(r.read_at)
       from public.chat_message_reads r
      where r.message_id = m.id
        and r.user_id = m.recipient_id
   )
 where m.recipient_id is not null
   and m.delivery_at is null
   and exists (
     select 1
       from public.chat_message_reads r
      where r.message_id = m.id
        and r.user_id = m.recipient_id
   );
