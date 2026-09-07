# ANIMAC Vintage & Singles — setup draft

New server based on TCG_ANIMAC. Customer-facing channel names and onboarding are English.
Server name and order-management separation await user choice.

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

## Reuse and required adaptations

- Reuse create_ticket/close_ticket controls and existing private ticket access model.
- Register /vip in the new guild and enable creation of the VIP category there.
- Replace the current general support welcome with vintage/single-specific text for this guild.
- Do not reuse the current order-notifications destination: it is fixed to the existing guild/thread.
- If order management is shared, persist the source guild per order and route each order to exactly one staff destination, including later payment updates. An account can buy in both servers; customer identity alone cannot determine the destination.
- Configure customer linking only after the tenant/shared-management choice.
- Create the server via the normal Discord UI under the user's ownership, then install the bot through the normal authorization screen. Discord has deprecated bot API guild creation.

## Verification before opening

Verify public/staff/customer access, ticket creation and repeat opening, inactivity/reply lifecycle, staff-only VIP actions, and source-aware order routing if enabled.
Retain existing customer conversations in the original server; the new server starts with fresh channels.
