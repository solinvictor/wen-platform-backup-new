-- `buyers` never actually had an `email` column, despite orders/route.ts,
-- paystack-initialize, and monnify-initialize all reading/writing
-- `buyers.email` — this silently broke the buyer-insert step of every
-- checkout and the email-lookup step of every payment initialization.
alter table public.buyers add column if not exists email text;
