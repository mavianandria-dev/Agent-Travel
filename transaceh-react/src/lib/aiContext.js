/* Ringkasan data pengguna untuk Asisten AI.
   Hanya data milik pengguna yang sedang login; tidak ada email/HP/nama penumpang. */
import { DB } from './db.js';
import { routeById, schedById } from './domain.js';
import { redactPII } from './aiPrivacy.js';
import { ticketsForEmail } from './support.js';

const MAX_ITEMS = 5;

export function buildAiContext(user) {
  if (!user || !user.email) {
    return { loggedIn: false, bookings: [], tickets: [] };
  }

  const email = String(user.email).toLowerCase();
  const bookings = DB.load('bookings', [])
    .filter((booking) => String(booking.userEmail || '').toLowerCase() === email)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, MAX_ITEMS)
    .map((booking) => {
      const schedule = booking.scheduleId ? schedById(booking.scheduleId) : null;
      const route = schedule ? routeById(schedule.routeId) : null;
      return {
        code: String(booking.code || ''),
        route: route ? `${route.from} → ${route.to}` : '',
        date: String(schedule?.date || ''),
        time: String(schedule?.time || ''),
        status: String(booking.status || ''),
        tripStatus: String(booking.tripStatus || ''),
        seats: Array.isArray(booking.seats) ? booking.seats.length : 0,
        total: Number(booking.total) || 0,
      };
    });

  const tickets = ticketsForEmail(email).slice(0, MAX_ITEMS).map((ticket) => {
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    const last = [...messages].reverse().find((message) => message && message.text && message.from !== 'system')
      || [...messages].reverse().find((message) => message && message.text);
    return {
      code: String(ticket.code || ''),
      channel: String(ticket.channel || 'report'),
      category: String(ticket.category || ''),
      subject: redactPII(ticket.subject, 160),
      status: String(ticket.status || ''),
      updatedAt: String(ticket.updatedAt || ticket.createdAt || ''),
      lastMessage: redactPII(last?.text, 240),
    };
  });

  return { loggedIn: true, bookings, tickets };
}
