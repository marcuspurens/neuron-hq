-- Migration 004: Atomic confidence decay function
CREATE OR REPLACE FUNCTION decay_confidence(
  target_table TEXT,
  inactive_days INTEGER DEFAULT 20,
  decay_factor REAL DEFAULT 0.9
) RETURNS TABLE(updated_count INTEGER, avg_before REAL, avg_after REAL) AS $$
DECLARE
  v_updated INTEGER;
  v_avg_before REAL;
  v_avg_after REAL;
BEGIN
  -- Validate table name (SQL injection protection)
  IF target_table NOT IN ('kg_nodes', 'aurora_nodes') THEN
    RAISE EXCEPTION 'Invalid table name: %', target_table;
  END IF;

  -- Calculate average before decay
  EXECUTE format('SELECT COALESCE(AVG(confidence), 0) FROM %I WHERE updated < NOW() - make_interval(days => $1)', target_table)
    INTO v_avg_before USING inactive_days;

  -- Apply confidence decay atomically
  EXECUTE format('
    UPDATE %I
    SET confidence = confidence * $1,
        updated = NOW()
    WHERE updated < NOW() - make_interval(days => $2)
      AND confidence > 0.01
    ', target_table)
    USING decay_factor, inactive_days;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Calculate average after decay
  EXECUTE format('SELECT COALESCE(AVG(confidence), 0) FROM %I WHERE updated >= NOW() - interval ''1 minute''', target_table)
    INTO v_avg_after;

  RETURN QUERY SELECT v_updated, v_avg_before, v_avg_after;
END;
$$ LANGUAGE plpgsql;
