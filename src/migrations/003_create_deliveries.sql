CREATE TABLE deliveries(
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    event_id  BIGINT NOT NULL references events(id) ON DELETE RESTRICT,
    endpoint_id BIGINT NOT NULL references endpoints(id) ON DELETE RESTRICT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed')),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ NOT NULL
)

