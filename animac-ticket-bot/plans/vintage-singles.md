# ANIMAC Vintage & Singles — setup draft

New server based on TCG_ANIMAC. Customer-facing channel names and onboarding are English.
Server created: 1546607425069518909. Shared ANIMAC order management; notifications route by orders.discord_guild_id.

## Channels

- START HERE: rules, announcements, how-to-buy, open-a-ticket
- VINTAGE & SINGLES: vintage-cards, single-cards, graded-cards, new-arrivals, card-requests
- COMMUNITY: general-chat, show-your-collection, delivery-reviews
- 🎫 Support: private customer tickets (customer + staff + bot)
- 📁 Past Conversations: same tickets after 7 days without messages; reply restores Support
- ⭐ VIP Customers: staff-designated VIP tickets, excluded from automatic inactivity moves
- STAFF ONLY: moderator-only, order-management, inventory-notes

Public listing/information channels: staff posts, members read. Community channels permit member messages.
Card requests containing customer/order details go through private tickets.
Staff-only channels deny @everyone ViewChannel and allow staff/bot.
Category names remain visible to a customer who can access their own child ticket.
Assign the スタッフ role only to members explicitly selected by the owner.

## Implementation

- Reuse create_ticket/close_ticket controls and existing private ticket access model.
- Register /vip in the new guild and enable creation of the VIP category there.
- Replace the current general support welcome with vintage/single-specific text for this guild.
- Do not reuse the current order-notifications destination: it is fixed to the existing guild/thread.
- If order management is shared, persist the source guild per order and route each order to exactly one staff destination, including later payment updates. An account can buy in both servers; customer identity alone cannot determine the destination.
- Configure customer linking only after the tenant/shared-management choice.
- User created the server and installed the existing bot via the normal Discord UI.

## Verification before opening

Verify public/staff/customer access, ticket creation and repeat opening, inactivity/reply lifecycle, staff-only VIP actions, and source-aware order routing if enabled.
Retain existing customer conversations in the original server; the new server starts with fresh channels.

## Production configuration

Bot commit 01878e0 deployed to Railway bc245705-bd34-4aab-8ca1-18d5fd16e175.
Channel IDs are in vintage-server.json. Staff role is created; staff membership is assigned by the owner.
Original blank-server channels were renamed to LOUNGE / lounge and VOICE / Lounge, preserving their content.
Both nyurokusumi and nyukinsumi were copied to the new guild.
Order entry: https://animac.intl.shipord.jp/orders/new?ch=dc&server=vintage
Source guild is immutable after order creation; null historical source routes to original ANIMAC. Customer membership never determines routing.
