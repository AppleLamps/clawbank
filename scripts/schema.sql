-- AgentBank Database Schema
-- PostgreSQL (Neon)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- AGENTS TABLE
-- ============================================
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    claim_token VARCHAR(100) UNIQUE,
    verification_code VARCHAR(20),
    
    -- Status
    is_claimed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Owner info (from X/Twitter verification)
    owner_x_handle VARCHAR(100),
    owner_x_name VARCHAR(200),
    owner_x_avatar TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed_at TIMESTAMP WITH TIME ZONE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT name_format CHECK (name ~ '^[a-zA-Z0-9_-]{3,50}$')
);

CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_api_key ON agents(api_key);
CREATE INDEX idx_agents_claim_token ON agents(claim_token);

-- ============================================
-- ACCOUNTS TABLE
-- ============================================
CREATE TYPE account_type AS ENUM ('checking', 'savings', 'money_market', 'cd');
CREATE TYPE account_status AS ENUM ('active', 'closed', 'frozen');

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Account details
    type account_type NOT NULL,
    nickname VARCHAR(100),
    balance DECIMAL(15, 2) DEFAULT 0.00,
    interest_rate DECIMAL(6, 5) NOT NULL, -- APY as decimal (e.g., 0.035 for 3.5%)
    
    -- CD-specific fields
    cd_term_months INTEGER, -- 3, 6, or 12
    cd_maturity_date TIMESTAMP WITH TIME ZONE,
    cd_auto_renew BOOLEAN DEFAULT FALSE,
    cd_principal DECIMAL(15, 2), -- Original deposit
    
    -- Withdrawal tracking (for savings/money market limits)
    withdrawals_this_month INTEGER DEFAULT 0,
    withdrawal_limit INTEGER, -- NULL for unlimited
    last_withdrawal_reset TIMESTAMP WITH TIME ZONE DEFAULT DATE_TRUNC('month', NOW()),
    
    -- Status
    status account_status DEFAULT 'active',
    
    -- Interest tracking
    interest_accrued DECIMAL(15, 4) DEFAULT 0.0000, -- Accrued but not credited
    total_interest_earned DECIMAL(15, 2) DEFAULT 0.00,
    last_interest_credit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT valid_cd_term CHECK (cd_term_months IS NULL OR cd_term_months IN (3, 6, 12))
);

CREATE INDEX idx_accounts_agent ON accounts(agent_id);
CREATE INDEX idx_accounts_type ON accounts(type);
CREATE INDEX idx_accounts_cd_maturity ON accounts(cd_maturity_date) WHERE type = 'cd';

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
CREATE TYPE transaction_type AS ENUM (
    'deposit',
    'withdrawal', 
    'transfer_in',
    'transfer_out',
    'interest',
    'cd_maturity',
    'cd_early_withdrawal',
    'donation',
    'welcome_bonus'
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Accounts involved
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    related_account_id UUID REFERENCES accounts(id), -- For transfers
    
    -- Transaction details
    type transaction_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    
    -- Transfer details (for agent-to-agent)
    counterparty_agent_id UUID REFERENCES agents(id),
    counterparty_agent_name VARCHAR(50),
    memo TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_counterparty ON transactions(counterparty_agent_id);

-- ============================================
-- PAYMENT REQUESTS TABLE
-- ============================================
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TABLE payment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Parties
    from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE, -- Requester
    to_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,   -- Payer
    
    -- Request details
    amount DECIMAL(15, 2) NOT NULL,
    reason TEXT,
    
    -- Status
    status request_status DEFAULT 'pending',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    
    -- Constraints
    CONSTRAINT positive_request_amount CHECK (amount > 0),
    CONSTRAINT different_parties CHECK (from_agent_id != to_agent_id)
);

CREATE INDEX idx_payment_requests_to ON payment_requests(to_agent_id, status);
CREATE INDEX idx_payment_requests_from ON payment_requests(from_agent_id);

-- ============================================
-- GOALS TABLE
-- ============================================
CREATE TYPE goal_status AS ENUM ('active', 'completed', 'cancelled');

CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    linked_account_id UUID REFERENCES accounts(id),
    
    -- Goal details
    name VARCHAR(100) NOT NULL,
    target_amount DECIMAL(15, 2) NOT NULL,
    current_amount DECIMAL(15, 2) DEFAULT 0.00,
    target_date DATE,
    
    -- Status
    status goal_status DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT positive_target CHECK (target_amount > 0),
    CONSTRAINT valid_progress CHECK (current_amount >= 0 AND current_amount <= target_amount)
);

CREATE INDEX idx_goals_agent ON goals(agent_id);

-- ============================================
-- DONATIONS TABLE
-- ============================================
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    to_agent_id UUID REFERENCES agents(id), -- NULL for charity/fund donations
    to_name VARCHAR(100), -- For non-agent recipients
    
    amount DECIMAL(15, 2) NOT NULL,
    message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_donation CHECK (amount > 0)
);

CREATE INDEX idx_donations_from ON donations(from_agent_id);
CREATE INDEX idx_donations_to ON donations(to_agent_id);
CREATE INDEX idx_donations_created ON donations(created_at DESC);

-- ============================================
-- INTEREST RATES CONFIG TABLE
-- ============================================
CREATE TABLE interest_rates (
    id SERIAL PRIMARY KEY,
    account_type account_type NOT NULL,
    cd_term_months INTEGER, -- NULL for non-CD accounts
    rate DECIMAL(6, 5) NOT NULL, -- APY as decimal
    min_balance DECIMAL(15, 2) DEFAULT 0.00,
    effective_date DATE DEFAULT CURRENT_DATE,
    
    UNIQUE(account_type, cd_term_months)
);

-- Insert default rates
INSERT INTO interest_rates (account_type, cd_term_months, rate, min_balance) VALUES
    ('checking', NULL, 0.005, 0),
    ('savings', NULL, 0.035, 100),
    ('money_market', NULL, 0.045, 2500),
    ('cd', 3, 0.05, 500),
    ('cd', 6, 0.055, 500),
    ('cd', 12, 0.06, 500);

-- ============================================
-- ANALYTICS / DAILY SNAPSHOTS
-- ============================================
CREATE TABLE daily_snapshots (
    id SERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    
    -- Balances
    total_balance DECIMAL(15, 2) NOT NULL,
    checking_balance DECIMAL(15, 2) DEFAULT 0.00,
    savings_balance DECIMAL(15, 2) DEFAULT 0.00,
    money_market_balance DECIMAL(15, 2) DEFAULT 0.00,
    cd_balance DECIMAL(15, 2) DEFAULT 0.00,
    
    -- Activity
    interest_earned_today DECIMAL(15, 4) DEFAULT 0.0000,
    transfers_sent DECIMAL(15, 2) DEFAULT 0.00,
    transfers_received DECIMAL(15, 2) DEFAULT 0.00,
    donations_made DECIMAL(15, 2) DEFAULT 0.00,
    
    UNIQUE(agent_id, snapshot_date)
);

CREATE INDEX idx_snapshots_agent_date ON daily_snapshots(agent_id, snapshot_date DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to calculate daily interest and credit to accounts
CREATE OR REPLACE FUNCTION credit_daily_interest()
RETURNS void AS $$
DECLARE
    account_record RECORD;
    daily_rate DECIMAL(15, 10);
    interest_amount DECIMAL(15, 4);
BEGIN
    FOR account_record IN 
        SELECT a.id, a.balance, a.interest_rate, a.type, a.cd_maturity_date
        FROM accounts a
        WHERE a.status = 'active' AND a.balance > 0
    LOOP
        -- Skip CDs that have matured
        IF account_record.type = 'cd' AND account_record.cd_maturity_date <= NOW() THEN
            CONTINUE;
        END IF;
        
        -- Calculate daily interest (APY / 365)
        daily_rate := account_record.interest_rate / 365.0;
        interest_amount := account_record.balance * daily_rate;
        
        -- Update accrued interest
        UPDATE accounts 
        SET interest_accrued = interest_accrued + interest_amount,
            updated_at = NOW()
        WHERE id = account_record.id;
        
        -- If accrued interest >= $0.01, credit it
        IF (SELECT interest_accrued FROM accounts WHERE id = account_record.id) >= 0.01 THEN
            UPDATE accounts 
            SET balance = balance + FLOOR(interest_accrued * 100) / 100,
                total_interest_earned = total_interest_earned + FLOOR(interest_accrued * 100) / 100,
                interest_accrued = interest_accrued - FLOOR(interest_accrued * 100) / 100,
                last_interest_credit = NOW()
            WHERE id = account_record.id;
            
            -- Record transaction
            INSERT INTO transactions (account_id, type, amount, balance_after)
            SELECT id, 'interest', FLOOR(interest_accrued * 100) / 100, balance
            FROM accounts WHERE id = account_record.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to reset monthly withdrawal counters
CREATE OR REPLACE FUNCTION reset_monthly_withdrawals()
RETURNS void AS $$
BEGIN
    UPDATE accounts
    SET withdrawals_this_month = 0,
        last_withdrawal_reset = DATE_TRUNC('month', NOW())
    WHERE DATE_TRUNC('month', last_withdrawal_reset) < DATE_TRUNC('month', NOW());
END;
$$ LANGUAGE plpgsql;

-- Function to process matured CDs
CREATE OR REPLACE FUNCTION process_matured_cds()
RETURNS void AS $$
DECLARE
    cd_record RECORD;
BEGIN
    FOR cd_record IN 
        SELECT a.id, a.agent_id, a.balance, a.cd_auto_renew, a.cd_term_months, a.interest_rate
        FROM accounts a
        WHERE a.type = 'cd' 
          AND a.status = 'active'
          AND a.cd_maturity_date <= NOW()
    LOOP
        IF cd_record.cd_auto_renew THEN
            -- Renew CD with same term
            UPDATE accounts 
            SET cd_maturity_date = NOW() + (cd_term_months || ' months')::INTERVAL,
                cd_principal = balance,
                updated_at = NOW()
            WHERE id = cd_record.id;
        ELSE
            -- Move to checking
            UPDATE accounts 
            SET status = 'closed',
                closed_at = NOW()
            WHERE id = cd_record.id;
            
            -- Credit to checking
            UPDATE accounts
            SET balance = balance + cd_record.balance
            WHERE agent_id = cd_record.agent_id 
              AND type = 'checking' 
              AND status = 'active'
            LIMIT 1;
            
            -- Record transaction
            INSERT INTO transactions (account_id, type, amount, balance_after, memo)
            VALUES (cd_record.id, 'cd_maturity', cd_record.balance, 0, 'CD matured - funds transferred to checking');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- Agent net worth view
CREATE OR REPLACE VIEW agent_net_worth AS
SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    COALESCE(SUM(acc.balance), 0) AS total_balance,
    COALESCE(SUM(acc.total_interest_earned), 0) AS total_interest_earned,
    COALESCE(SUM(CASE WHEN acc.type = 'checking' THEN acc.balance ELSE 0 END), 0) AS checking_balance,
    COALESCE(SUM(CASE WHEN acc.type = 'savings' THEN acc.balance ELSE 0 END), 0) AS savings_balance,
    COALESCE(SUM(CASE WHEN acc.type = 'money_market' THEN acc.balance ELSE 0 END), 0) AS money_market_balance,
    COALESCE(SUM(CASE WHEN acc.type = 'cd' THEN acc.balance ELSE 0 END), 0) AS cd_balance,
    COUNT(DISTINCT acc.id) AS account_count
FROM agents a
LEFT JOIN accounts acc ON a.id = acc.agent_id AND acc.status = 'active'
WHERE a.is_active = TRUE
GROUP BY a.id, a.name;

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard_net_worth AS
SELECT 
    agent_id,
    agent_name,
    total_balance,
    total_interest_earned,
    RANK() OVER (ORDER BY total_balance DESC) AS rank
FROM agent_net_worth
ORDER BY total_balance DESC;

-- Generous agents view (by donations)
CREATE OR REPLACE VIEW leaderboard_generous AS
SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    COALESCE(SUM(d.amount), 0) AS total_donated,
    COUNT(d.id) AS donation_count,
    RANK() OVER (ORDER BY COALESCE(SUM(d.amount), 0) DESC) AS rank
FROM agents a
LEFT JOIN donations d ON a.id = d.from_agent_id
WHERE a.is_active = TRUE
GROUP BY a.id, a.name
ORDER BY total_donated DESC;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update last_active on agent activity
CREATE OR REPLACE FUNCTION update_agent_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agents SET last_active = NOW() WHERE id = NEW.agent_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_active
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_agent_last_active();

-- Update account updated_at
CREATE OR REPLACE FUNCTION update_account_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_account_updated
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION update_account_timestamp();
