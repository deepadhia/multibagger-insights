-- ============================================================
-- MBIQ Sample Data Seed
-- Generated: 2026-03-08
-- 
-- This file contains sample data for local development.
-- Run after applying all migrations:
--   psql $DATABASE_URL -f supabase/seed.sql
--
-- NOTE: prices (8000+ rows) and sector_indices (10000+ rows) 
-- are NOT included here due to size. Use the edge functions
-- refresh-all-prices and fetch-sector-indices to populate them.
-- ============================================================

-- ============================================================
-- STOCKS
-- ============================================================
INSERT INTO stocks (id, company_name, ticker, sector, category, investment_thesis, tracking_directives, metric_keys, screener_slug, buy_price, next_results_date) VALUES
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Time Technoplast', 'TIMETECHNO', 'Industrial', 'Core', 'Composite cylinders turnaround', 'COMPANY FOCUS (TIMETECHNO): I am tracking their margin expansion via the transition from legacy industrial packaging to Value-Added Products (VAP). You must hunt for the exact VAP EBITDA margins, the revenue share of VAP (targeting >30%), and the specific commercial rollout status and revenue realization of Type-4 composite cylinders (including hydrogen/CNG). Track the exact net debt figure to verify if the QIP proceeds are actually being utilized for debt reduction. Ignore generic macroeconomic fluff.', '["revenue_growth","opm","pat_growth","vap_ebitda_margin","vap_revenue_share","type4_cylinder_status","net_debt","order_book"]'::jsonb, 'TIMETECHNO', NULL, '2026-04-15'),
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Anant Raj Limited', 'ANANTRAJ', 'Real Estate / Data Centers', 'Core', 'NCR real estate + data centers', 'COMPANY FOCUS (ANANTRAJ): I am tracking their aggressive pivot into the data center space alongside their NCR real estate execution. You must extract the exact MW capacity operationalized at their tech parks (specifically tracking the scale-up to the promised 307 MW). For real estate, hunt for exact pre-sales volume, realization per square foot, and new project launch pipelines. Track net debt reduction quarter-over-quarter. Ruthlessly flag any management evasion regarding CAPEX timelines for the data centers.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'ANANTRAJ', NULL, NULL),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'HBL Engineering', 'HBL', 'Defence / Railways', 'Core', 'Railway Kavach + defence electronics', 'COMPANY FOCUS (HBL): I am tracking their execution of high-margin electronics and railway safety systems. You must hunt for specific revenue bookings and order book updates regarding TCAS (Kavach) and Train Control Systems. Track battery segment margins, specifically supplies for Vande Bharat and data centers. Extract the exact total order book size and EBITDA margin trajectory. Flag any delays in government tender executions or supply chain bottlenecks.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'HBLENGINE', NULL, NULL),
('eee644da-2bac-43c2-99bb-c90fce89b546', 'Lumax Auto Technologies', 'LUMAXTECH', 'Auto Components', 'Core', 'Auto premiumisation', 'COMPANY FOCUS (LUMAXTECH): I am tracking their premiumization play and market share gains in the Indian auto lighting space. You must hunt for updates on the shift from Halogen to LED lighting and how it is impacting EBITDA margins. Extract specific new order wins or wallet share gains with major OEMs (Maruti, M&M, Tata). Monitor the performance and revenue contributions from their various Joint Ventures (JVs). Flag any margin contraction due to raw material costs or OEM pricing pressure.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'LUMAXTECH', NULL, NULL),
('90b2dbe6-88ef-41b9-8578-846a77bc5389', 'INOX India', 'INOXINDIA', 'Infrastructure', 'Core', 'LNG / hydrogen infrastructure', 'COMPANY FOCUS (INOXINDIA): I am tracking their execution of high-margin cryogenic equipment and export growth. You must extract the exact order book size and the split between standard equipment and highly engineered projects. Hunt for specific management commentary on the LNG and Hydrogen sectors. Track the export vs. domestic revenue mix and its impact on overall EBITDA margins. Flag any slowdowns in order inflows or execution delays in specialized projects.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'INOXINDIA', NULL, NULL),
('d482e455-9313-4433-8be5-65ea6455bcf9', 'CCL Products', 'CCL', 'FMCG / Exports', 'Core', 'Coffee export compounder', 'COMPANY FOCUS (CCL): I am tracking their global capacity expansion and B2C margin scaling. You must hunt for the exact capacity utilization rates of their Vietnam and India plants. Track the product mix shift between freeze-dried and spray-dried coffee. Extract updates on their domestic B2C brand (Continental Coffee) market share and revenue. Ruthlessly track how they are managing raw coffee bean price volatility and its exact impact on EBITDA margins.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'CCL', NULL, NULL),
('a8e56e7f-6889-40a6-bba5-1e95ec8bfc75', 'Astra Microwave Products', 'ASTRAMICRO', 'Defence', 'Core', 'Defence radar systems', 'COMPANY FOCUS (ASTRAMICRO): I am tracking their transition from a sub-system supplier to a system integrator in the defense sector. You must extract the exact order book size and the domestic vs. export mix. Track the margin profile, specifically looking for improvement in domestic margins. Hunt for updates on radar systems, electronic warfare deliveries, and R&D capitalization. Flag any delays in defense procurement or execution slowdowns.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'ASTRAMICRO', NULL, NULL),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Quality Power Electrical Equipments', 'QPEL', 'Power', 'Core', 'Grid expansion / power capex', 'COMPANY FOCUS (QPEL): I am tracking their order book execution and margin expansion in high-voltage equipment and power automation. You must hunt for specific updates on renewable integration and grid connectivity projects. Extract the exact total order book size and the domestic vs. export mix. Track the EBITDA margin trajectory and flag any supply chain bottlenecks or delays in government/utility tender executions. Ignore generic commentary on global energy transitions.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'QPOWER', NULL, NULL),
('df081ecf-b893-499c-b378-f2d96c7c8dc2', 'Gravita India', 'GRAVITA', 'Recycling', 'Core', 'Metal recycling + battery ecosystem', 'COMPANY FOCUS (GRAVITA): I am tracking their global capacity expansion and margin per ton across their recycling verticals (Lead, Aluminum, Plastic, Rubber). You must extract the exact capacity utilization rates and newly commissioned capacities in overseas and domestic plants. Hunt for the volume growth percentage and EBITDA per ton metrics. Track their progress on securing scrap supply and any tailwinds from battery waste management regulations. Flag any margin contractions due to volatile LME prices or freight costs.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'GRAVITA', NULL, NULL),
('f03909cb-e3d5-4667-afdd-f3666941179f', 'Jyoti CNC Automation', 'JYOTICNC', 'Capital Goods', 'Watchlist', NULL, 'COMPANY FOCUS (JYOTICNC): I am tracking their execution of the massive aerospace and defence order book. You must extract the exact total order book size and the split between Aerospace, Defence, and EMS (Electronic Manufacturing Services). Hunt for updates on their debt reduction timeline and the improvement in EBITDA margins as operating leverage kicks in. Flag any delays in the execution of the EMS orders or timeline slippages in capacity expansions.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'JYOTICNC', NULL, NULL),
('c729e0a2-448b-4c6e-a30e-ed539a88d171', 'Elecon Engineering', 'ELECON', 'Capital Goods', 'Watchlist', NULL, 'COMPANY FOCUS (ELECON): I am tracking the export-led growth of their Gear division and the sustained turnaround of the Material Handling Equipment (MHE) division. You must extract the exact order inflow numbers, separating domestic from overseas orders. Hunt for the EBITDA margin specifically for the Gear division. Track any management commentary on capacity utilization and new OEM partnerships globally. Flag any margin dilution from the MHE segment or slowdowns in industrial capex.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'ELECON', NULL, NULL),
('fe78b611-560d-4669-b2b1-40a715453d16', 'SJS Enterprises', 'SJS', 'Auto Components', 'Watchlist', NULL, 'COMPANY FOCUS (SJS): I am tracking their premiumization play in automotive and consumer appliance aesthetics. You must extract specific updates on their chrome-plated and optical plastics product lines, along with new customer additions. Hunt for the exact export revenue growth and updates on synergies from recent acquisitions (e.g., WPI). Track the EBITDA margin trajectory carefully. Flag any margin pressure from raw materials or slowdowns in the 2-wheeler/passenger vehicle production volumes.', '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'SJS', NULL, NULL),
('b12a5ebc-0e4f-4f1e-9028-e268ac2d22ff', 'Shakti Pumps', 'SHAKTIPUMP', 'Industrial', 'Watchlist', NULL, NULL, '["revenue_growth","opm","pat_growth","order_book"]'::jsonb, 'SHAKTIPUMP', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FINANCIAL METRICS (sample: TIMETECHNO + QPEL)
-- ============================================================
INSERT INTO financial_metrics (stock_id, year, revenue, net_profit, eps, opm, revenue_growth, profit_growth, roce, roe, debt_equity, free_cash_flow, promoter_holding) VALUES
-- Time Technoplast
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2014, 2155, 99, 2.27, 14, NULL, NULL, 13, 10.7, 0.93, 214, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2015, 2447, 113, 2.61, 14, 13.5, 14.1, 13, 10.9, 0.78, 269, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2016, 2396, 142, 3.29, 15, -2.1, 25.7, 14, 12.2, 0.64, 289, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2017, 2755, 151, 3.25, 15, 15, 6.3, 14, 11.4, 0.54, 188, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2018, 3103, 185, 3.99, 15, 12.6, 22.5, 15, 12.5, 0.52, 303, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2019, 3564, 209, 4.48, 15, 14.9, 13, 16, 12.5, 0.5, 281, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2020, 3578, 175, 3.74, 14, 0.4, -16.3, 13, 9.6, 0.49, 301, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2021, 3005, 106, 2.29, 13, -16, -39.4, 9, 5.6, 0.45, 257, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2022, 3650, 192, 4.16, 14, 21.5, 81.1, 12, 9.3, 0.44, 291, NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2023, 4289, 224, 4.84, 13, 17.5, 16.7, 13, 9.9, 0.4, 370, 51.47),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2024, 4992, 316, 6.84, 14, 16.4, 41.1, 16, 12.4, 0.32, 406, 51.56),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 2025, 5457, 394, 8.55, 14, 9.3, 24.7, 17, 12.9, 0.22, 431, 51.62),
-- Quality Power
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 2022, 183, 42, 110133.33, 13, NULL, NULL, NULL, 45.6, 0.13, 9, NULL),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 2023, 253, 40, 137400, 13, 38.3, -4.8, 28, 35.7, 0.1, 44, NULL),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 2024, 302, 55, 5.19, 13, 19.4, 37.5, 31, 35.9, 0.25, 52, NULL),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 2025, 337, 100, 8.54, 19, 11.6, 81.8, 27, 21.3, 0.08, 62, 73.91)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FINANCIAL RESULTS (quarterly - sample)
-- ============================================================
INSERT INTO financial_results (stock_id, quarter, revenue, ebitda_margin) VALUES
-- Time Technoplast
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2022', 1129, 13),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2023', 1192, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2023', 1079, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2023', 1194, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2023', 1325, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2024', 1394, 13),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2024', 1230, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2024', 1371, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2024', 1388, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2025', 1565, 15),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2025', 1469, 15),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2025', 1353, 14),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2025', 1511, 15),
-- Quality Power
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Dec 2023', 142, 8),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Mar 2024', 39, 34),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Jun 2024', 61, 38),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Sep 2024', 94, 9),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Dec 2024', 73, 24),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Mar 2025', 108, 15),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Jun 2025', 177, 18),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Sep 2025', 206, 18),
('6fcd6b8a-487f-4f18-a021-a3524dde9f17', 'Dec 2025', 284, 28)
ON CONFLICT DO NOTHING;

-- ============================================================
-- TRANSCRIPT ANALYSIS (HBL Q3)
-- ============================================================
INSERT INTO transcript_analysis (stock_id, quarter, year, management_tone, sentiment_score, analysis_summary, demand_outlook, capacity_expansion, guidance, growth_drivers, margin_drivers, risks, industry_tailwinds, hidden_signals, important_quotes) VALUES
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 2025, 'Bullish', 9,
 'HBL Engineering delivered a robust Q3 with 32% revenue growth and significant margin expansion, driven by high-value segments like Kavach (railway safety) and defense electronics. The company is transitioning towards a higher-margin product mix, supported by a massive Rs 4,200 crore order book and a 40% capacity expansion coming online in early FY26. Management''s guidance suggests a clear path to high-growth and improved capital efficiency over the next three years.',
 'Very strong, particularly in the railway safety (Kavach) and defense sectors, supported by government mandates and increased infrastructure spending.',
 'A new facility in Hyderabad is under construction with an investment of Rs 120 crores; it is expected to be operational by Q1 FY26 and will increase current capacity by 40%.',
 'Revenue of Rs 2,800-3,000 crores for FY25 and Rs 3,800-4,000 crores for FY26; 25%+ annual growth expected over the next 3 years.',
 '["Rapid expansion of Kavach safety system deployment across 10,000 route kilometers.","High-growth defense electronics segment (fuses and battery systems).","Capacity expansion for specialized manufacturing.","Exploration of the emerging EV battery market."]'::jsonb,
 '["Increased revenue share from high-margin Kavach and defense electronics orders.","Stabilized raw material costs.","Operating leverage from higher capacity utilization."]'::jsonb,
 '["Potential reliance on government contracts and budget allocations.","Execution risk of the 40% capacity expansion by Q1 FY26.","Technological shifts in the EV battery space."]'::jsonb,
 '["Government mandate for Kavach deployment across Indian Railways.","Increased Indian defense budget and focus on indigenization.","Growing infrastructure and safety requirements in the railway sector."]'::jsonb,
 '["Operating leverage kicking in as revenue scales across fixed costs.","High barriers to entry in Kavach with only 3-4 qualified suppliers.","Pricing power and margin expansion due to a shift towards specialized electronics from traditional products.","Improving capital efficiency through reduced working capital days."]'::jsonb,
 '["The Kavach project continues to gain momentum... we expect our share to increase significantly.","We expect defence to contribute 35% of revenue by FY27, up from 22% currently.","Our order book stands at Rs 4,200 crores, providing strong revenue visibility for the next 18-24 months.","We are one of the key suppliers and expect our share to increase significantly.","We are targeting 25% ROCE by FY27 as we scale up and improve asset utilization."]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- MANAGEMENT COMMITMENTS (HBL)
-- ============================================================
INSERT INTO management_commitments (stock_id, quarter, statement, metric, target_value, timeline, status) VALUES
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 'We are guiding for revenue of Rs 2,800-3,000 crores for FY25.', 'Revenue Guidance FY25', '2800-3000 Cr', 'FY250', 'Pending'),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 'We are guiding for revenue of Rs 3,800-4,000 crores for FY26.', 'Revenue Guidance FY26', '3800-4000 Cr', 'FY26', 'Pending'),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 'We are targeting EBITDA margins of 16-17% by FY26.', 'EBITDA Margin Target', '16-17%', 'FY26', 'Pending'),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 'We are targeting 25% ROCE by FY27 as we scale up and improve asset utilization.', 'ROCE Target', '25%', 'FY27', 'Pending'),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Q3', 'Target is 75-80 days by end of FY26.', 'Working Capital Days', '75-80 days', 'FY26', 'Pending')
ON CONFLICT DO NOTHING;

-- ============================================================
-- MANAGEMENT PROMISES (TIMETECHNO)
-- ============================================================
INSERT INTO management_promises (stock_id, made_in_quarter, promise_text, target_deadline, status, resolved_in_quarter) VALUES
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 'Targeting a ROCE of 20% for FY26 and a 2% minimum increase every year thereafter.', 'FY26', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 'Repayment / pre-payment, in full or in part, of certain outstanding borrowings using ₹400 Cr from QIP proceeds.', 'H2_FY26', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 'Commercial production of 200/250 liters composite CNG cylinders will be available in the expansion capacity in Q4.', 'Q4_FY26', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 'Transform 75% of its electricity consumption to green energy within the next two years.', 'FY28', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 'Launch of 6 kg and 9 kg composite fire extinguishers in Q4 of this financial year.', 'Q4_FY26', 'broken', 'Q3_FY26'),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q3_FY26', 'Company to be completely debt-free in the next 6 months'' time.', 'Q1_FY27', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q3_FY26', 'Phase II work of the Brownfield Automated IBC Facility at Silvassa is expected to be completed by the end of FY26-27, scaling capacity to 300,000 IBCs p.a.', 'Q4_FY27', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q3_FY26', 'Overseas Capacity Expansion in Georgia, USA (adding an additional IBC line and drum manufacturing line) to be completed within the next 45 days.', 'Q4_FY26', 'pending', NULL),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q3_FY26', 'Confirm the flexible IBC acquisition (Ebullient Packaging) deal by March 2026, subject to due diligence.', 'Q4_FY26', 'pending', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- QUARTERLY SNAPSHOTS (TIMETECHNO Q2_FY26)
-- ============================================================
INSERT INTO quarterly_snapshots (stock_id, quarter, confidence_score, summary, thesis_status, thesis_momentum, thesis_drift_status, thesis_status_reason, metrics, red_flags, dodged_questions) VALUES
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q2_FY26', 85,
 'Time Technoplast delivered a solid Q2 FY26 with 10.3% revenue growth and 17.4% PAT expansion. The transition thesis is executing flawlessly, with Value-Added Products (VAP) hitting the 30% revenue share mark for the quarter and commanding an 18.7% EBITDA margin compared to the stagnant 13.1% in legacy products. The company successfully raised ₹800 Cr via QIP, earmarking ₹400 Cr for aggressive debt repayment, though organic H1 net debt was only reduced by ₹56.4 Cr. Commercialization of high-capacity Type-4 cylinders and a flexible IBC acquisition remain critical milestones for H2.',
 'strengthening', 'improving', 'none',
 'Management is perfectly executing the baseline thesis, scaling VAP to a 30% share, expanding VAP margins to 18.7%, and explicitly committing ₹400 Cr from the recent QIP specifically for debt reduction.',
 '{"revenue_growth":{"value":"10.3%","evidence":"Revenue Growth 10.3%"},"opm":{"value":"14.8%","evidence":"EBITDA Margin 14.8%"},"pat_growth":{"value":"17.4%","evidence":"PAT after Minority Interest 1,154 Q2FY26 vs 984 Q2FY25 17.4%"},"vap_ebitda_margin":{"value":"18.7%","evidence":"Value Added Products Revenue and EBITDA Margin (%) 18.7%"},"vap_revenue_share":{"value":"30%","evidence":"Value Added Products 30%"},"type4_cylinder_status":{"value":"Capacity expansion completing in Q4","evidence":"expansion plan, which is on the way, is going to be complete in the Q4"},"net_debt":{"value":"Reduced by ₹56.4 Cr in H1","evidence":"Total Debt (Net of Cash) reduced by Rs. 564 Mn in H1FY26 from FY25"},"order_book":{"value":"₹1,950 Mn (CNG Cascades)","evidence":"Strong order book- Composite Cylinders (CNG Cascades) 1,950 Mn"}}'::jsonb,
 '["The ₹400 Cr QIP funds earmarked for debt repayment are currently lying in the escrow account, meaning interest cost savings will be delayed until actual deployment."]'::jsonb,
 '["Management deflected providing a precise timeline for the 14.2 kg LPG cylinder approvals from OMCs, keeping it vague."]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- QUARTERLY SNAPSHOTS (TIMETECHNO Q3_FY26)
-- ============================================================
INSERT INTO quarterly_snapshots (stock_id, quarter, confidence_score, summary, thesis_status, thesis_momentum, thesis_drift_status, thesis_status_reason, metrics, red_flags, dodged_questions) VALUES
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Q3_FY26', 82,
 'Time Technoplast Q3 FY26 showed continued momentum with revenue growth and margin expansion.',
 'strengthening', 'stable', 'none',
 'Core thesis execution continues with VAP expansion and debt reduction on track.',
 '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INSIDER TRADES (ANANTRAJ)
-- ============================================================
INSERT INTO insider_trades (stock_id, person_name, person_category, trade_date, trade_type, num_securities, avg_price, trade_value, exchange, mode_of_acquisition, securities_type) VALUES
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Shri Ashok Sarin Anant Raj LLP', 'Promoter Group', '2025-12-08', 'insider', 100000, 504.99, 50498930, 'NSE', 'Buy', 'Equity Shares'),
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Shri Ashok Sarin Anant Raj LLP', 'Promoter Group', '2025-12-09', 'insider', 70000, 498.75, 34912382, 'NSE', 'Buy', 'Equity Shares'),
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Shri Ashok Sarin Anant Raj LLP', 'Promoter Group', '2025-12-10', 'insider', 15000, 510.53, 7657915, 'NSE', 'Buy', 'Equity Shares'),
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Shri Ashok Sarin Anant Raj LLP', 'Promoter Group', '2025-12-11', 'insider', 15000, 506.18, 7592711, 'NSE', 'Buy', 'Equity Shares'),
('a35dd629-755a-451a-a9b6-a38ff532ef69', 'Shri Ashok Sarin Anant Raj LLP', 'Promoter Group', '2025-12-12', 'insider', 15000, 551.59, 8273860, 'NSE', 'Buy', 'Equity Shares')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SHAREHOLDING (sample: TIMETECHNO + HBL)
-- ============================================================
INSERT INTO shareholding (stock_id, quarter, promoters, fiis, diis, public_holding) VALUES
-- Time Technoplast
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2023', 51.47, 8.05, 8.16, 32.31),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2023', 51.69, 6.88, 6.21, 35.22),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2023', 51.69, 5.96, 9.95, 32.39),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2023', 51.51, 5.7, 10.42, 32.37),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2024', 51.56, 6.18, 10.93, 31.32),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2024', 51.56, 6.78, 10.97, 30.67),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2024', 51.56, 6.69, 12.87, 28.88),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2024', 51.56, 7.65, 13.2, 27.6),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Mar 2025', 51.62, 8.07, 12.99, 27.32),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Jun 2025', 51.62, 8.29, 12.92, 27.16),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Sep 2025', 51.62, 8.41, 13.18, 26.79),
('82b18c4d-afc6-49e8-9983-79e671bd5c9c', 'Dec 2025', 47.51, 11.66, 16.7, 24.13),
-- HBL Engineering
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Mar 2023', 59.08, 0.91, 0, 40),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Jun 2023', 59.1, 2.63, 0.14, 38.14),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Sep 2023', 59.11, 2.23, 0.08, 38.58),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Dec 2023', 59.11, 2.66, 0.41, 37.82),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Mar 2024', 59.11, 4.59, 0.66, 35.65),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Jun 2024', 59.11, 4.66, 1.07, 35.17),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Sep 2024', 59.1, 4.91, 0.96, 35.02),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Dec 2024', 59.1, 5.22, 0.39, 35.27),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Mar 2025', 59.1, 4.83, 0.36, 35.7),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Jun 2025', 59.1, 4.83, 0.36, 35.7),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Sep 2025', 59.11, 5.87, 0.82, 34.2),
('865037cc-d96d-47ba-99c4-2841ef9963b5', 'Dec 2025', 59.11, 5.87, 0.82, 34.2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- NOTE: To populate prices and sector_indices, run:
--   1. Call the refresh-all-prices edge function with { "backfill": true }
--   2. Call the fetch-sector-indices edge function
--   3. Call the fetch-results-calendar edge function
-- ============================================================
