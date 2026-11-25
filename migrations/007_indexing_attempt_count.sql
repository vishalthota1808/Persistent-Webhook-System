CREATE INDEX idx_deliveries_pending_next_attempt
ON deliveries(next_attempt_at)
WHERE status = 'pending';

-- this particular above SQL code is for creating an index named idx_deliveries_pending_next_attempt on the table deliveries on the column next_attempt_at where status is pending is just filtering. So this helps SQL to efficiently query our required one earliest pending delivery from this index
/*
Results after indexing. The execution time has gotten down from 61 milliseconds to 0.184 milliseconds using this index.

Limit (cost=0.28..3.00 rows=1 width=53) (actual time=0.151..0.152 rows=1 loops=1)
Buffers: shared hit=1 read=2
-> Index Scan using idx_deliveries_pending_next_attempt on deliveries (cost=0.28..4988.32 rows=1833 width=53) (actual time=0.149..6.15
0 rows=1 loops=1)
Index Cond: (next_attempt_at <= now())
Buffers: shared hit=1 read=2
Planning:
Buffers: shared hit=118 read=1
Planning Time: 0.691 ms
Execution Time: 0.184 ms.

*/