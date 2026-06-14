DO $$
DECLARE
    del_orgs text[] := ARRAY['aelixxr', 'naija-agent-master'];
BEGIN
    -- 1. Transfer balance from naija-agent-master to zynux
    UPDATE organizations
    SET balance_kobo = balance_kobo + COALESCE((SELECT balance_kobo FROM organizations WHERE id = 'naija-agent-master'), 0)
    WHERE id = 'zynux';

    -- 2. Update aelixxr-life-companion phone ID
    UPDATE organizations
    SET whatsapp_phone_id = '2349015772541'
    WHERE id = 'aelixxr-life-companion';

    -- 3. Cascade Delete aelixxr and naija-agent-master
    DELETE FROM cart_items WHERE chat_id IN (SELECT id FROM chats WHERE org_id = ANY(del_orgs));
    DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE org_id = ANY(del_orgs));
    DELETE FROM chats WHERE org_id = ANY(del_orgs);
    DELETE FROM activities WHERE org_id = ANY(del_orgs);
    DELETE FROM cron_jobs WHERE org_id = ANY(del_orgs);
    DELETE FROM daily_snapshots WHERE org_id = ANY(del_orgs);
    DELETE FROM fraud_registry WHERE org_id = ANY(del_orgs);
    DELETE FROM knowledge WHERE org_id = ANY(del_orgs);
    DELETE FROM memories WHERE org_id = ANY(del_orgs);
    DELETE FROM products WHERE org_id = ANY(del_orgs);
    DELETE FROM staff WHERE org_id = ANY(del_orgs);
    DELETE FROM staging_products WHERE org_id = ANY(del_orgs);
    DELETE FROM system_logs WHERE org_id = ANY(del_orgs);
    DELETE FROM transactions WHERE org_id = ANY(del_orgs);
    DELETE FROM organizations WHERE id = ANY(del_orgs);
END $$;
