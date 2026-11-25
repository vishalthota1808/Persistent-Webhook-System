INSERT INTO deliveries (
    event_id,
    endpoint_id,
    attempt_count,
    status,
    next_attempt_at
)
SELECT
    e.id,
    ep.id,
    0,
    CASE
        WHEN random() < 0.99 THEN 'delivered'
        ELSE 'pending'
    END,
    NOW() - (random() * INTERVAL '7 days')
FROM generate_series(1, 200000) AS g
CROSS JOIN LATERAL (SELECT id FROM events ORDER BY random() LIMIT 1) AS e
CROSS JOIN LATERAL (SELECT id FROM endpoints ORDER BY random() LIMIT 1) AS ep;

-- this particular file is for adding some large number of deliveries, in order to test the indexing of the queries.

/*
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM deliveries
WHERE status = 'pending'
  AND next_attempt_at <= now()
ORDER BY next_attempt_at
LIMIT 1;
*/

/* The below is the actual output of the above SQL explained code:

Limit (cost=4934.35..4934.46 rows=1 width=53) (actual time=55.576..61.405 rows=1 loops=1)
Buffers: shared hit=1907
-> Gather Merge (cost=4934.35..5058.32 rows=1078 width=53) (actual time=55.571..61.395 rows=1 loops=1)
Workers Planned: 1
Workers Launched: 1
Buffers: shared hit=1907
-> Sort (cost=3934.34..3937.03 rows=1078 width=53) (actual time=46.411..46.414 rows=1 loops=2)
Sort Key: next_attempt_at
Sort Method: top-N heapsort Memory: 25kB
Buffers: shared hit=1907
Worker 0: Sort Method: top-N heapsort Memory: 25kB
-> Parallel Seq Scan on deliveries (cost=0.00..3928.95 rows=1078 width=53) (actual time=0.040..45.563 rows=982 loops=2)
Filter: ((status = 'pending'::text) AND (next_attempt_at <= now()))
Rows Removed by Filter: 99024
Buffers: shared hit=1870
Planning:
Buffers: shared hit=44
Planning Time: 0.532 ms
Execution Time: 61.496 ms

The most important point here is that SQL uses parallel sequential scanning on deliveries. That means it will scan the entire table in order to find the required rows.
*/