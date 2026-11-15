BEGIN;
ALTER TABLE parser_handoffs DROP CONSTRAINT parser_handoffs_head_fk;
DROP TABLE parser_checkpoint_attempts;
DROP TABLE parser_handoffs;
COMMIT;
