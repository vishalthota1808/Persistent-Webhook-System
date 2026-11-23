
-- Insert two endpoints
WITH endpoint_one AS (
    INSERT INTO endpoints (url, secret)
    VALUES ('https://example.com/webhook', 'secret_123')
    RETURNING id
),
endpoint_two AS (
    INSERT INTO endpoints (url, secret)
    VALUES ('https://api.example.org/events', 'secret_456')
    RETURNING id
),

-- Insert one event
event_row AS (
    INSERT INTO events (type, payload, idempotency_key)
    VALUES (
        'payment.success',
        '{"payment_id": 101, "amount": 500, "currency": "INR"}',
        'demo-payment-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    )
    RETURNING id
),

-- Create two deliveries for the same event
delivery_one AS (
    INSERT INTO deliveries (
        event_id, endpoint_id, status, attempt_count
    )
    SELECT event_row.id, endpoint_one.id, 'delivered', 1
    FROM event_row, endpoint_one
    RETURNING id
),
delivery_two AS (
    INSERT INTO deliveries (
        event_id, endpoint_id, status, attempt_count
    )
    SELECT event_row.id, endpoint_two.id, 'pending', 1
    FROM event_row, endpoint_two
    RETURNING id
)

-- Record one attempt for each delivery
INSERT INTO attempts (
    delivery_id,
    duration_ms,
    response_status,
    error
)
SELECT id, 250, 200, NULL FROM delivery_one

UNION ALL

SELECT id, 120, 503, 'Service Unavailable' FROM delivery_two;
