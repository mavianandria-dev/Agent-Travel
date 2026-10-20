/* Klien streaming Asisten AI TransAceh.
   Browser hanya memanggil Worker; API key NVIDIA tidak pernah ada di sini. */

const RAW_BASE = String(
  import.meta.env.VITE_AI_PROXY_URL || (import.meta.env.DEV ? 'http://localhost:8787' : ''),
).trim().replace(/\/+$/, '');

export const AI_AVAILABLE = !!RAW_BASE;
export const AI_ENDPOINT = RAW_BASE
  ? (RAW_BASE.endsWith('/api/chat') ? RAW_BASE : RAW_BASE + '/api/chat')
  : '';

export class AiError extends Error {
  constructor(code, message, status) {
    super(message || 'Layanan AI tidak tersedia.');
    this.name = 'AiError';
    this.code = code || 'error';
    this.status = status || 0;
  }
}

function parseErrorLine(line) {
  const clean = line.replace(/\r$/, '');
  if (!clean.startsWith('data:')) return '';
  return clean.slice(5).trim();
}

export async function streamAiReply({ messages, context, signal, onDelta }) {
  if (!AI_ENDPOINT) {
    throw new AiError('not_configured', 'Asisten AI belum dikonfigurasi.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 90000);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  let content = '';

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ messages, context }),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });

    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        detail = data && data.error ? String(data.error) : '';
      } catch {
        try {
          detail = String(await response.text()).slice(0, 200);
        } catch { /* abaikan */ }
      }
      const code = response.status === 429
        ? 'rate_limit'
        : (response.status === 401 || response.status === 403 ? 'auth' : 'http');
      throw new AiError(code, detail || 'Layanan AI tidak tersedia.', response.status);
    }

    if (!response.body) throw new AiError('empty', 'Respons AI kosong.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleLine = (line) => {
      const data = parseErrorLine(line);
      if (!data || data === '[DONE]') return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      const delta = event?.choices?.[0]?.delta;
      const text = delta?.content;
      if (typeof text === 'string' && text) {
        content += text;
        if (onDelta) onDelta(text);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);

    if (!content.trim()) throw new AiError('empty', 'Asisten tidak mengirim jawaban.');
    return content;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) throw new AiError('aborted', 'Jawaban dihentikan.');
      if (timedOut) throw new AiError('timeout', 'Asisten terlalu lama merespons.');
      throw new AiError('aborted', 'Jawaban dihentikan.');
    }
    throw new AiError('network', 'Tidak dapat menghubungi Asisten AI.');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
