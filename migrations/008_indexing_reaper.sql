CREATE INDEX idx_deliveries_inflight_locked_until
ON deliveries(locked_until)
WHERE status = 'in_flight';

-- Suppose a worker claims a delivery and locks it for 5 seconds, but the delivery worker has been crashed. So, that particular delivery will be in flight forever.
-- so, Reaper is a background process which scans the deliveries which are stuck at in-flight and recovers them.
-- so, we are creating a proper indexing for this particular reaper to scan efficiently the entire deliveries table to efficiently find in_flight long deliveries.