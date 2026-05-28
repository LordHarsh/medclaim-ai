-- ============================================================
-- ROW LEVEL SECURITY + UPDATED_AT TRIGGER
-- ============================================================
-- Strategy: Session variable approach (like Supabase-style)
-- Frontend sets: SET LOCAL app.current_user_id = '<session.user.id>'
-- Lambda sets: SET LOCAL app.bypass_rls = 'on'
-- ============================================================

-- 1. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims;
CREATE TRIGGER trg_claims_updated_at
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. ENABLE RLS
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 3. SERVICE BYPASS POLICIES (for Lambda worker)
-- When app.bypass_rls = 'on', full access is granted
DROP POLICY IF EXISTS claims_service_all ON claims;
CREATE POLICY claims_service_all ON claims
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS docs_service_all ON claim_documents;
CREATE POLICY docs_service_all ON claim_documents
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS history_service_all ON claim_history;
CREATE POLICY history_service_all ON claim_history
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS members_service_all ON members;
CREATE POLICY members_service_all ON members
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- 4. USER POLICIES FOR CLAIMS
-- User can only see/insert claims for their own member_id
DROP POLICY IF EXISTS claims_user_select ON claims;
CREATE POLICY claims_user_select ON claims
    FOR SELECT
    USING (
        member_id IN (
            SELECT member_id FROM members
            WHERE auth_user_id = current_setting('app.current_user_id', true)
        )
    );

DROP POLICY IF EXISTS claims_user_insert ON claims;
CREATE POLICY claims_user_insert ON claims
    FOR INSERT
    WITH CHECK (
        member_id IN (
            SELECT member_id FROM members
            WHERE auth_user_id = current_setting('app.current_user_id', true)
        )
    );

-- 5. USER POLICIES FOR CLAIM_DOCUMENTS
DROP POLICY IF EXISTS docs_user_select ON claim_documents;
CREATE POLICY docs_user_select ON claim_documents
    FOR SELECT
    USING (
        claim_id IN (
            SELECT claim_id FROM claims
            WHERE member_id IN (
                SELECT member_id FROM members
                WHERE auth_user_id = current_setting('app.current_user_id', true)
            )
        )
    );

DROP POLICY IF EXISTS docs_user_insert ON claim_documents;
CREATE POLICY docs_user_insert ON claim_documents
    FOR INSERT
    WITH CHECK (
        claim_id IN (
            SELECT claim_id FROM claims
            WHERE member_id IN (
                SELECT member_id FROM members
                WHERE auth_user_id = current_setting('app.current_user_id', true)
            )
        )
    );

-- 6. USER POLICIES FOR CLAIM_HISTORY
DROP POLICY IF EXISTS history_user_select ON claim_history;
CREATE POLICY history_user_select ON claim_history
    FOR SELECT
    USING (
        member_id IN (
            SELECT member_id FROM members
            WHERE auth_user_id = current_setting('app.current_user_id', true)
        )
    );

DROP POLICY IF EXISTS history_user_insert ON claim_history;
CREATE POLICY history_user_insert ON claim_history
    FOR INSERT
    WITH CHECK (
        member_id IN (
            SELECT member_id FROM members
            WHERE auth_user_id = current_setting('app.current_user_id', true)
        )
    );

-- 7. USER POLICIES FOR MEMBERS
-- Can see own record + unbound records (for onboarding)
DROP POLICY IF EXISTS members_user_select ON members;
CREATE POLICY members_user_select ON members
    FOR SELECT
    USING (
        auth_user_id = current_setting('app.current_user_id', true)
        OR auth_user_id IS NULL
    );

-- Can update only unbound records or own record (for onboarding binding)
DROP POLICY IF EXISTS members_user_update ON members;
CREATE POLICY members_user_update ON members
    FOR UPDATE
    USING (
        auth_user_id IS NULL
        OR auth_user_id = current_setting('app.current_user_id', true)
    );

-- 8. POLICY_CONFIG is read-only for everyone (no RLS needed, public data)
-- Not enabling RLS on policy_config since it's shared reference data
