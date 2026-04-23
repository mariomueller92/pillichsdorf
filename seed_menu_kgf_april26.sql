-- Seed-Skript Speisekarte "KGF April 26" (Rainer Wein)
-- Quelle: KGF_April26.pdf
--
-- Struktur:
--   - Weißwein & Rosé     → alle 1/8 Preise der weißen/roséfarbenen Weine
--   - Rotwein             → alle 1/8 Preise der Rotweine
--   - Spezialwein & Rappa → 1/8 Preise für PetNat, OrangeWein und Rappa 2cl
--   - Flasche             → alle "Tisch" Preise, gemischt (weiß/rosé/rot + PetNat, OrangeWein; Rappa 0,33l)
--   - Keller              → alle "ab Keller 0,75l" Preise, gemischt (weiß/rosé/rot + PetNat, OrangeWein)
--   - Alkoholfrei, Snacks, Brote, Süßes
--
-- HINWEIS: Setzt Kategorien + Artikel komplett neu auf. Bestehende Einträge
-- werden entfernt. Das DELETE schlägt fehl, falls bereits Bestellungen
-- (order_items) auf menu_items referenzieren — in dem Fall vorher
-- orders/order_items leeren oder Artikel manuell deaktivieren.

BEGIN TRANSACTION;

DELETE FROM menu_items;
DELETE FROM menu_categories;
DELETE FROM sqlite_sequence WHERE name IN ('menu_items', 'menu_categories');

-- ------------------------------------------------------------------
-- Kategorien
-- ------------------------------------------------------------------
INSERT INTO menu_categories (name, sort_order, target) VALUES
  ('Weißwein & Rosé',      1, 'schank'),
  ('Rotwein',              2, 'schank'),
  ('Spezialwein & Rappa',  3, 'schank'),
  ('Flasche',              4, 'schank'),
  ('Keller',               5, 'schank'),
  ('Alkoholfrei',          6, 'schank'),
  ('Snacks',               7, 'schank'),
  ('Brote',                8, 'kueche'),
  ('Süßes',                9, 'kueche');

-- ------------------------------------------------------------------
-- Weißwein & Rosé — 1/8 Preise
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Weinviertel DAC 2025 Black Edition',   3.50, 1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Weinviertel DAC 2025 Silver Edition',  4.00, 2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Grüner Veltliner Qualitätswein 2025',  3.00, 3, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Welschriesling Qualitätswein 2025',    3.50, 4, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Zweigelt Rosé Qualitätswein 2025',     4.00, 5, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Weinviertel DAC 2024',                 3.50, 6, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Weinviertel DAC 2024 Reserve',         4.50, 7, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Grüner Veltliner 2024 halbtrocken',    3.00, 8, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Weißwein & Rosé'), 'Riesling 2022',                        3.50, 9, 'sofort');

-- ------------------------------------------------------------------
-- Rotwein — 1/8 Preise
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Rotwein'), 'Merlot 2024',             4.00, 1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Rotwein'), 'Blauburger 2024',         4.00, 2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Rotwein'), 'Trilogie 2023 Barrique',  4.50, 3, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Rotwein'), 'Zweigelt 2022 Barrique',  4.50, 4, 'sofort');

-- ------------------------------------------------------------------
-- Spezialwein & Rappa — 1/8 Preise (PetNat, OrangeWein, Rappa 2cl)
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Spezialwein & Rappa'), 'PetNat 2023–2025',      5.00, 1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Spezialwein & Rappa'), 'OrangeWein 2022',       4.00, 2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Spezialwein & Rappa'), 'Rappa 2022–2024 2cl',   2.50, 3, 'sofort');

-- ------------------------------------------------------------------
-- Flasche — "Tisch" Preise (gemischt, inkl. PetNat, OrangeWein, Rappa 0,33l)
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Weinviertel DAC 2025 Black Edition',  19.00,  1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Weinviertel DAC 2025 Silver Edition', 22.00,  2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Grüner Veltliner Qualitätswein 2025', 16.00,  3, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Welschriesling Qualitätswein 2025',   10.00,  4, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Zweigelt Rosé Qualitätswein 2025',    22.00,  5, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Weinviertel DAC 2024',                19.00,  6, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Weinviertel DAC 2024 Reserve',        25.00,  7, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Grüner Veltliner 2024 halbtrocken',   16.00,  8, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Riesling 2022',                       19.00,  9, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Merlot 2024',                         22.00, 10, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Blauburger 2024',                     22.00, 11, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Trilogie 2023 Barrique',              25.00, 12, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Zweigelt 2022 Barrique',              25.00, 13, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'PetNat 2023–2025',                    28.00, 14, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'OrangeWein 2022',                     22.00, 15, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Flasche'), 'Rappa 2022–2024 0,33l',               14.00, 16, 'sofort');

-- ------------------------------------------------------------------
-- Keller — "ab Keller 0,75l" Preise (gemischt, inkl. PetNat, OrangeWein)
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Weinviertel DAC 2025 Black Edition',   7.00,  1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Weinviertel DAC 2025 Silver Edition',  8.00,  2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Grüner Veltliner Qualitätswein 2025',  6.00,  3, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Welschriesling Qualitätswein 2025',    7.00,  4, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Zweigelt Rosé Qualitätswein 2025',     9.00,  5, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Weinviertel DAC 2024',                 8.00,  6, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Weinviertel DAC 2024 Reserve',        13.00,  7, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Grüner Veltliner 2024 halbtrocken',    6.00,  8, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Riesling 2022',                        7.00,  9, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Merlot 2024',                          8.00, 10, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Blauburger 2024',                      8.00, 11, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Trilogie 2023 Barrique',               9.00, 12, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'Zweigelt 2022 Barrique',               9.00, 13, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'PetNat 2023–2025',                    11.00, 14, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Keller'), 'OrangeWein 2022',                      9.00, 15, 'sofort');

-- ------------------------------------------------------------------
-- Alkoholfrei (schank / sofort)
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Gspritzter 1/4',             2.50,  1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Gspritzter 1/2',             4.00,  2, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft Natur 1/4',      3.00,  3, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft Natur 1/2',      5.00,  4, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft Leitung 1/4',    3.00,  5, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft Leitung 1/2',    5.00,  6, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft gespritzt 1/4',  2.50,  7, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Traubensaft gespritzt 1/2',  4.00,  8, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Sodawasser 1/4',             1.50,  9, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Alkoholfrei'), 'Sodawasser 1,5l',            6.00, 10, 'sofort');

-- ------------------------------------------------------------------
-- Snacks (schank / sofort)
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Snacks'), 'Popcorn klein', 2.00, 1, 'sofort'),
  ((SELECT id FROM menu_categories WHERE name='Snacks'), 'Popcorn groß',  4.00, 2, 'sofort');

-- ------------------------------------------------------------------
-- Brote "Gegen den Hunger" (kueche / lieferzeit) — je € 4,50
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Schinken',           4.50,  1, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Speck',              4.50,  2, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Thunfisch',          4.50,  3, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Schweinsbratl',      4.50,  4, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Kümmelbratl',        4.50,  5, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Käse',               4.50,  6, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Obatzen',            4.50,  7, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Erdäpfelkas',        4.50,  8, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Eieraufstrich',      4.50,  9, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Brote'), 'Brot Veganer Aufstrich',  4.50, 10, 'lieferzeit');

-- ------------------------------------------------------------------
-- Süßes selbstgemacht (kueche / lieferzeit) — je € 3,50
-- ------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Schaumrollen',          3.50, 1, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Sachertorte',           3.50, 2, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Cheesecake',            3.50, 3, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Obstkuchen',            3.50, 4, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Bisquitroulade',        3.50, 5, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Veganer Apfelkuchen',   3.50, 6, 'lieferzeit'),
  ((SELECT id FROM menu_categories WHERE name='Süßes'), 'Topfenstrudel',         3.50, 7, 'lieferzeit');

COMMIT;
