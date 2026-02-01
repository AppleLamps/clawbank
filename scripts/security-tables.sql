-- Security Enhancement Tables
-- Run this in your Neon SQL Editor

-- ============================================
-- RATE LIMITING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    ip_address VARCHAR(45), -- Supports IPv6
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite index for fast lookups
    UNIQUE(agent_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_agent ON rate_limits(agent_id, endpoint);
CREATE INDEX idx_rate_limits_ip ON rate_limits(ip_address, endpoint);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- Cleanup function for old rate limit records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUDIT LOG TABLE
-- ============================================
CREATE TYPE audit_action AS ENUM (
    'register',
    'login',
    'transfer_out',
    'transfer_in',
    'deposit',
    'withdrawal',
    'early_withdrawal',
    'account_create',
    'account_close',
    'donation',
    'payment_request',
    'payment_approve',
    'payment_reject',
    'profile_update',
    'claim_verify',
    'api_key_used',
    'rate_limit_exceeded',
    'auth_failed'
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    agent_name VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- What
    action audit_action NOT NULL,
    resource_type VARCHAR(50), -- 'account', 'transfer', 'agent', etc.
    resource_id UUID,

    -- Details
    details JSONB DEFAULT '{}',
    amount DECIMAL(15, 2), -- For financial operations

    -- Outcome
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    -- When
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_agent ON audit_logs(agent_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_ip ON audit_logs(ip_address);

-- View for recent suspicious activity
CREATE OR REPLACE VIEW suspicious_activity AS
SELECT
    agent_id,
    agent_name,
    ip_address,
    action,
    COUNT(*) as attempt_count,
    MAX(created_at) as last_attempt
FROM audit_logs
WHERE success = FALSE
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id, agent_name, ip_address, action
HAVING COUNT(*) >= 5
ORDER BY attempt_count DESC;

-- View for high-value transactions
CREATE OR REPLACE VIEW high_value_transactions AS
SELECT
    al.*,
    a.name as agent_name_current
FROM audit_logs al
LEFT JOIN agents a ON al.agent_id = a.id
WHERE al.amount >= 1000
  AND al.action IN ('transfer_out', 'withdrawal', 'early_withdrawal', 'donation')
ORDER BY al.created_at DESC;
