-- Add performance indexes for AI Audit Logs pagination and date range filtering
CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_op_status ON ai_audit_logs(operation, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_user ON ai_audit_logs(user_id);
