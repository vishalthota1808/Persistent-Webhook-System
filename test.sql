EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM deliveries
WHERE endpoint_id = 1
  AND status = 'pending'
ORDER BY next_attempt_at
LIMIT 20;
