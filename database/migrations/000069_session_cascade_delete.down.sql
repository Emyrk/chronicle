ALTER TABLE user_auth_session
    DROP CONSTRAINT user_auth_session_user_auth_id_fkey,
    ADD CONSTRAINT user_auth_session_user_auth_id_fkey
        FOREIGN KEY (user_auth_id) REFERENCES user_auth_links(id);
