# Ticket lifecycle

- After 7 days without a message, move tickets into 📁 Closed. Run at startup and every 15 minutes.
- New tickets and human messages move tickets into 🎫 In Progress.
- Close Ticket archives without deleting history. Opening an existing ticket reactivates it.
- Preserve channel permissions with lockPermissions: false. Categories overflow after 50 channels.
- If message history cannot be read, leave the ticket unchanged and log the error.
- Discord category collapse and mute are per-user settings; the bot cannot collapse categories for everyone.
- The timer uses elapsed UTC timestamps, independent of the Mac timezone.

Validation: node --test ticket-lifecycle.test.js

Railway: project resilient-vision (549addfe-5b08-4270-bd4f-bb1feb47f694),
service quadra-workspace (6ff8cfea-1293-4baa-95a0-90f46aca192b), production.
Existing service source is v1106719921219/quadra-workspace, rootDirectory animac-ticket-bot.

## Customer names

Registered Discord customers with a unique account match are shown as `ticket-customer-name-original-account`.
Ambiguous matches are skipped. A customer-page link and original account are preserved in the channel topic.
Existing-ticket lookup uses the customer's private member permission, so renaming does not create duplicate tickets.
Staff `/confirm` also binds the selected customer. Refresh runs at startup and every 15 minutes.

## Order management thread

`order-notifications.js` targets TCG_ANIMAC private thread 1502702479765147650 under moderator-only 1491967299505094716.
Apply migrations/20260908_discord_order_notifications.sql to the ANIMAC order database.
Only new ANIMAC `dc` orders are queued; historical orders are not backfilled. Wait two minutes after writes to let order details finish saving.
The worker runs every 30 seconds, edits one post per order, and adds the existing `nyurokusumi` and `nyukinsumi` custom emoji according to database state.
Payment confirmation reversal removes only the bot's 入金済 reaction. Manual staff reactions are not removed.
Addresses, phone numbers, email and free-form notes are not copied into the notification.
Outbox claims, version checks, message IDs, stable nonce and footer recovery protect retries from duplicate posts and lost concurrent updates.
The table has RLS enabled and no client access; service_role and database triggers manage it.
Run `node --test *.test.js` to validate formatting, identity safety, archive handling and message recovery.

History reads run in batches of 10; category moves must be sent individually because Discord rejects multiple parent changes in one request.

## Staff-designated VIP customers

The `⭐ VIP Customers` category is created at startup in TCG_ANIMAC. No customer is designated automatically.
In a ticket, staff/admin can use `/vip` (or `/vip action:on`) and `/vip action:off` to remove the designation.
Membership of the VIP category is the persistent designation; manually moving a ticket into that category also works.
VIP tickets remain there on messages, inactivity and Close Ticket. They are exempt from the seven-day archive rule.
Removing VIP restores the normal active/closed category according to the last message timestamp.
Individual customer access remains unchanged; this does not grant VIP customers access to one another's tickets.
