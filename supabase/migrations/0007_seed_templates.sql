-- 0007_seed_templates.sql — two built-in, fully-editable maintenance templates.
--
-- Mercedes-Benz W202 C180 (M111) and VW Polo 9N 1.4 (BBY). Interval/spec values are
-- RESEARCHED manufacturer-typical figures (sources: benzworld / VW guidance / owner
-- service books) — every item is marked spec_source 'researched — verify vs manual'
-- and is fully editable/deletable in the app. NOT gospel; confirm against your manual.
--
-- Seed runs in the SQL editor (no auth.uid()), so user_id is set explicitly to the owner.
-- Re-runnable: deletes the two fixed-id templates first (cascades to their items).

begin;

delete from public.maintenance_templates
where id in ('b2020000-0000-4000-8000-000000000202', 'b9090000-0000-4000-8000-000000000909');

insert into public.maintenance_templates (id, name, make, model, sub_model, engine_code, notes, is_builtin, user_id) values
  ('b2020000-0000-4000-8000-000000000202', 'Mercedes-Benz W202 C180 (M111)', 'Mercedes-Benz', 'C180', 'W202', 'M111',
   'Researched defaults — verify against your service booklet / WIS. M111 uses a timing CHAIN (not a belt).', true,
   '3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909', 'VW Polo 9N 1.4 16V (BBY)', 'Volkswagen', 'Polo', '9N 1.4', 'BBY',
   'Researched defaults — verify against your service booklet. BBY is an INTERFERENCE engine: a snapped timing belt bends valves.', true,
   '3563089a-faec-4143-8b6e-34fd7ca2d5ec');

-- ── W202 C180 items ──────────────────────────────────────────────────────────
insert into public.template_items
  (template_id, item, category, distance_interval_km, time_interval_months, priority, diy_difficulty,
   parts_needed, consumables_needed, torque_spec, warn_threshold_km, warn_threshold_days, spec_source, sort_order, user_id)
values
  ('b2020000-0000-4000-8000-000000000202','Engine Oil & Filter','Engine',10000,12,1,'Easy','Oil filter element','~5 L 5W-40 (MB 229.3/229.5)','Sump plug 25 Nm',1000,30,'researched — verify vs manual',1,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Air Filter','Filters',20000,24,3,'Easy','Air filter element',null,null,null,null,'researched — verify vs manual',2,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Fuel Filter','Filters',40000,48,2,'Moderate','Inline fuel filter',null,null,null,null,'researched — verify vs manual',3,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Spark Plugs','Engine',30000,48,2,'Easy','4× spark plugs',null,'25 Nm',null,null,'researched — verify vs manual',4,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Brake Fluid','Brakes',60000,24,1,'Moderate',null,'DOT 4 brake fluid (~1 L)','Bleed nipples 10 Nm',null,60,'researched — verify vs manual',5,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Coolant','Cooling',60000,36,2,'Easy',null,'MB 325.0 antifreeze + water (~8 L)',null,null,null,'researched — verify vs manual',6,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Manual Gearbox Oil','Transmission',60000,null,3,'Hard',null,'Manual transmission fluid (~1.5 L)',null,null,null,'researched — verify vs manual',7,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Timing Chain (inspect)','Engine',100000,null,2,'Pro','Chain + tensioner/guides if worn',null,null,null,null,'M111 uses a CHAIN not a belt — inspect for stretch/rattle. researched — verify vs manual',8,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Poly-V (Serpentine) Belt','Engine',60000,48,2,'Moderate','Poly-V belt + tensioner',null,null,null,null,'researched — verify vs manual',9,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Tyre Rotation','Tyres',10000,null,4,'Easy',null,null,'Wheel bolts 110 Nm',null,null,'researched — verify vs manual',10,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','Battery Check','Electrical',null,12,4,'Easy',null,null,null,null,null,'researched — verify vs manual',11,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b2020000-0000-4000-8000-000000000202','AC Service','HVAC',null,24,3,'Moderate',null,'R134a refrigerant',null,null,null,'researched — verify vs manual',12,'3563089a-faec-4143-8b6e-34fd7ca2d5ec');

-- ── VW Polo 9N 1.4 (BBY) items ───────────────────────────────────────────────
insert into public.template_items
  (template_id, item, category, distance_interval_km, time_interval_months, priority, diy_difficulty,
   parts_needed, consumables_needed, torque_spec, warn_threshold_km, warn_threshold_days, spec_source, sort_order, user_id)
values
  ('b9090000-0000-4000-8000-000000000909','Engine Oil & Filter','Engine',15000,12,1,'Easy','Oil filter','~3.2 L 5W-30/5W-40 (VW 502 00)','Sump plug 30 Nm',1000,30,'researched — verify vs manual',1,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Air Filter','Filters',30000,24,3,'Easy','Air filter element',null,null,null,null,'researched — verify vs manual',2,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Fuel Filter','Filters',60000,null,2,'Moderate','Fuel filter',null,null,null,null,'researched — verify vs manual',3,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Spark Plugs','Engine',60000,48,2,'Easy','4× spark plugs',null,'25–30 Nm',null,null,'researched — verify vs manual',4,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Brake Fluid','Brakes',null,24,1,'Moderate',null,'DOT 4 brake fluid (~1 L)',null,null,60,'researched — verify vs manual',5,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Coolant','Cooling',60000,60,2,'Easy',null,'G12/G13 coolant + water',null,null,null,'researched — verify vs manual',6,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Manual Gearbox Oil','Transmission',90000,null,3,'Hard',null,'VW G 052 gear oil (~2 L)',null,null,null,'researched — verify vs manual',7,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Timing Belt + Water Pump','Engine',120000,48,1,'Pro','Timing belt kit + water pump + tensioner','Coolant top-up','Cam/crank locking tools (T10016)',5000,120,'INTERFERENCE engine — snapped belt bends valves; do the water pump + tensioner together. researched — verify vs manual',8,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Poly-V (Auxiliary) Belt + Tensioner','Engine',90000,48,2,'Moderate','Poly-V belt + tensioner',null,null,null,null,'researched — verify vs manual',9,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Tyre Rotation','Tyres',10000,null,4,'Easy',null,null,'Wheel bolts 120 Nm',null,null,'researched — verify vs manual',10,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','Battery Check','Electrical',null,12,4,'Easy',null,null,null,null,null,'researched — verify vs manual',11,'3563089a-faec-4143-8b6e-34fd7ca2d5ec'),
  ('b9090000-0000-4000-8000-000000000909','AC Service','HVAC',null,24,3,'Moderate',null,'R134a refrigerant',null,null,null,'researched — verify vs manual',12,'3563089a-faec-4143-8b6e-34fd7ca2d5ec');

commit;
