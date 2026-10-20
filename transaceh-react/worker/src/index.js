/* Cloudflare Worker: proxy streaming untuk Asisten AI TransAceh.
   API key NVIDIA hanya hidup di secret Worker. */
import { buildSystemPrompt } from '../../src/lib/aiPrompt.js';
import { redactPII } from '../../src/lib/aiPrivacy.js';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'meta/muse-glimmer-30b';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://mavianandria-dev.github.io',
].join(',');

const MAX_BODY_CHARS = 64000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 6000;
const MAX_TOTAL_MESSAGE_CHARS = 30000;
const MAX_CONTEXT_ITEMS = 5;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function originAllowed(env, origin) {
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}

function corsHeaders(env, origin) {
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && originAllowed(env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(payload, status, env, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(env, origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function clean(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function messageText(value) {
  return String(value ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return [];
  const messages = [];
  let total = 0;

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    if (item.role !== 'user' && item.role !== 'assistant') continue;
    const content = messageText(item.content);
    if (!content) continue;
    if (total + content.length > MAX_TOTAL_MESSAGE_CHARS) break;
    total += content.length;
    messages.push({ role: item.role, content });
    if (messages.length >= MAX_MESSAGES) break;
  }

  return messages;
}

function sanitizeContext(value) {
  const source = value && typeof value === 'object' ? value : {};
  if (source.loggedIn !== true) {
    return { loggedIn: false, bookings: [], tickets: [] };
  }

  const bookings = (Array.isArray(source.bookings) ? source.bookings : [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((booking) => {
      const seats = Math.round(Number(booking?.seats) || 0);
      const total = Math.round(Number(booking?.total) || 0);
      return {
        code: clean(booking?.code, 30),
        route: clean(booking?.route, 120),
        date: clean(booking?.date, 20),
        time: clean(booking?.time, 20),
        status: clean(booking?.status, 30),
        tripStatus: clean(booking?.tripStatus, 30),
        seats: Number.isFinite(seats) ? Math.min(20, Math.max(0, seats)) : 0,
        total: Number.isFinite(total) ? Math.min(1000000000, Math.max(0, total)) : 0,
      };
    });

  const tickets = (Array.isArray(source.tickets) ? source.tickets : [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((ticket) => ({
      code: clean(ticket?.code, 30),
      channel: clean(ticket?.channel, 20),
      category: clean(ticket?.category, 80),
      subject: clean(redactPII(ticket?.subject, 160), 160),
      status: clean(ticket?.status, 30),
      updatedAt: clean(ticket?.updatedAt, 40),
      lastMessage: clean(redactPII(ticket?.lastMessage, 240), 240),
    }));

  return { loggedIn: true, bookings, tickets };
}

function upstreamAbort(request) {
  const controller = new AbortController();
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) controller.abort();
  }, 90000);
  const onAbort = () => {
    if (!settled) controller.abort();
  };

  if (request.signal) {
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (request.signal) request.signal.removeEventListener('abort', onAbort);
    },
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!originAllowed(env, origin)) {
      return json({ error: 'Origin tidak diizinkan.' }, 403, env, origin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        configured: !!env.NVIDIA_API_KEY,
        model: String(env.NVIDIA_MODEL || DEFAULT_MODEL),
      }, 200, env, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/api/chat') {
      return json({ error: 'Rute tidak ditemukan.' }, 404, env, origin);
    }

    if (!env.NVIDIA_API_KEY) {
      return json({ error: 'Layanan AI belum dikonfigurasi.' }, 503, env, origin);
    }

    let raw;
    try {
      raw = await request.text();
    } catch {
      return json({ error: 'Gagal membaca request.' }, 400, env, origin);
    }

    if (raw.length > MAX_BODY_CHARS) {
      return json({ error: 'Pesan terlalu panjang.' }, 413, env, origin);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Body JSON tidak valid.' }, 400, env, origin);
    }

    const messages = sanitizeMessages(body?.messages);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Riwayat percakapan tidak valid.' }, 400, env, origin);
    }

    const context = sanitizeContext(body?.context);
    const model = String(env.NVIDIA_MODEL || DEFAULT_MODEL).trim();
    const maxTokens = Math.min(2000, Math.max(256, Number(env.MAX_OUTPUT_TOKENS) || 1200));
    const abort = upstreamAbort(request);

    let upstream;
    try {
      upstream = await fetch(NVIDIA_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(context) },
            ...messages,
          ],
          temperature: 0.5,
          top_p: 0.9,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: abort.signal,
      });
    } catch (error) {
      abort.cleanup();
      if (error?.name === 'AbortError') {
        return json({ error: 'Permintaan dibatalkan.' }, 499, env, origin);
      }
      console.error('AI upstream request failed', error?.name || 'unknown');
      return json({ error: 'Layanan AI tidak dapat dihubungi.' }, 502, env, origin);
    }

    if (!upstream.ok) {
      abort.cleanup();
      console.error('AI upstream status', upstream.status);
      const status = upstream.status === 429 ? 429 : 502;
      return json({
        error: status === 429
          ? 'Asisten AI sedang sibuk. Coba lagi sebentar.'
          : 'Layanan AI sedang tidak tersedia.',
      }, status, env, origin);
    }

    if (!upstream.body) {
      abort.cleanup();
      return json({ error: 'Respons AI kosong.' }, 502, env, origin);
    }

    // Pipe manual agar timeout dan disconnect klien ikut menutup stream upstream.
    const { readable, writable } = new TransformStream();
    upstream.body.pipeTo(writable)
      .finally(() => abort.cleanup())
      .catch(() => { /* stream ditutup oleh klien/upstream */ });

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders(env, origin),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  },
};
