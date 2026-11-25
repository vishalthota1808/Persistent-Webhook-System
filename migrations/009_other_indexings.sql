CREATE INDEX idx_deliveries_event_id
ON deliveries(event_id);

CREATE INDEX idx_deliveries_endpoint_status
ON deliveries(endpoint_id, status);

CREATE INDEX idx_attempts_delivery_id
ON attempts(delivery_id);

-- so, these are some other indexings on deliveries table based on different purposes. like the first one for fetching deliveries based on event ID, the second one is for fetching deliveries based on endpoint ID and along with a status, and the third one is for fetching deliveries based on delivery ID.