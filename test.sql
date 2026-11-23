SELECT
    events.type,
    deliveries.status
FROM events
LEFT JOIN deliveries
    ON events.id = deliveries.event_id;