-- Private transactional mail payloads and durable Azure long-running operations.
ALTER TABLE notifications ADD COLUMN provider_operation_id TEXT;
ALTER TABLE notifications ADD COLUMN provider_status TEXT;
ALTER TABLE notifications ADD COLUMN subject TEXT;
ALTER TABLE notifications ADD COLUMN text_body TEXT;
ALTER TABLE notifications ADD COLUMN html_body TEXT;
ALTER TABLE notifications ADD COLUMN related_listing_ids TEXT;
