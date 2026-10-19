-- The check constraint still had the original placeholder category set
-- (vegetables, grains, tubers, poultry, fish, other) from the initial
-- schema, while the app (src/lib/categories.ts) has always used a
-- different, real slug set: chicken, eggs, fish, rice, beans, plus
-- 'other' for non-produce listings like "Perks". Any insert with
-- category = 'chicken' or 'eggs' — the only two currently active
-- categories — violated the constraint and failed outright.
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('chicken', 'eggs', 'fish', 'rice', 'beans', 'other'));
