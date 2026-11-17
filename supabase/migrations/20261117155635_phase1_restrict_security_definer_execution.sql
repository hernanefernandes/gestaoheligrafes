REVOKE EXECUTE ON FUNCTION public.heli_admin_set_stock_balance(uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.heli_seed_product_location_balances() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.heli_set_chat_sender_metadata() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_when_stock_reaches_zero() FROM PUBLIC, anon, authenticated;
