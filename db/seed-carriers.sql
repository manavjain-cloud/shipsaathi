INSERT INTO carrier_options VALUES ('Carrier A|Road economy|United Kingdom|Germany','Carrier A','Road economy','United Kingdom','Germany',180,'GBP',5,92,500),
('Carrier B|Road standard|United Kingdom|Germany','Carrier B','Road standard','United Kingdom','Germany',220,'GBP',3,95,750),
('Carrier C|Road express|United Kingdom|Germany','Carrier C','Road express','United Kingdom','Germany',340,'GBP',2,98,400),
('Carrier A|Road economy|United Kingdom|France','Carrier A','Road economy','United Kingdom','France',170,'GBP',5,92,500),
('Carrier B|Road standard|United Kingdom|France','Carrier B','Road standard','United Kingdom','France',210,'GBP',3,95,750),
('Carrier C|Road express|United Kingdom|France','Carrier C','Road express','United Kingdom','France',330,'GBP',2,98,400),
('Carrier A|Road economy|United Kingdom|Netherlands','Carrier A','Road economy','United Kingdom','Netherlands',160,'GBP',5,92,500),
('Carrier B|Road standard|United Kingdom|Netherlands','Carrier B','Road standard','United Kingdom','Netherlands',200,'GBP',3,95,750),
('Carrier C|Road express|United Kingdom|Netherlands','Carrier C','Road express','United Kingdom','Netherlands',320,'GBP',2,98,400) ON CONFLICT (id) DO UPDATE SET price_per_pallet=EXCLUDED.price_per_pallet, transit_days=EXCLUDED.transit_days, on_time_rate=EXCLUDED.on_time_rate, max_weight_per_pallet_kg=EXCLUDED.max_weight_per_pallet_kg;
