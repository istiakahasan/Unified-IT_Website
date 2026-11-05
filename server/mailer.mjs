import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

/**
 * Outbound email for the Agentic AI workflows.
 *
 * Every message is first written to agentic_email_outbox, then delivered over SMTP. If SMTP is not
 * configured, or delivery fails, the message stays in the outbox (QUEUED / FAILED) and an administrator
 * can resend it, so a submission is never lost because of a mail problem. No email addresses or
 * credentials are hard-coded: everything comes from the environment.
 *
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE=true for implicit TLS (465), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM, AGENTIC_NOTIFY_EMAIL (business inbox that receives every submission)
 */

export function mailerConfig(env = process.env) {
  const host = (env.SMTP_HOST || '').trim();
  const secure = String(env.SMTP_SECURE || '').toLowerCase() === 'true';
  return {
    configured: !!host && !!(env.MAIL_FROM || '').trim(),
    host,
    port: Number(env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: (env.MAIL_FROM || '').trim(),
    notifyEmail: (env.AGENTIC_NOTIFY_EMAIL || '').trim(),
    // Test/dev servers without TLS certificates can opt out of verification explicitly.
    rejectUnauthorized: String(env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
  };
}

export function schemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS agentic_email_outbox (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      related_ref TEXT,
      status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agentic_outbox_status ON agentic_email_outbox(status);
  `;
}

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

export function buildMessage({ from, to, subject, text }) {
  const body = Buffer.from(String(text), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeHeader(oneLine(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@agentic.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n');
}

/** Minimal SMTP dialogue (EHLO, optional STARTTLS, optional AUTH LOGIN, MAIL/RCPT/DATA). */
export function smtpSend(cfg, { to, subject, text }, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let socket;
    let buffer = '';
    let waiter = null;
    let done = false;
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), timeoutMs);

    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket && socket.destroy(); } catch { /* closed */ }
      err ? reject(err) : resolve();
    }
    const fail = (e) => finish(e);

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      pump();
    }
    function pump() {
      // a reply is complete when its last line has "NNN " (space) after the code
      const lines = buffer.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const reply = lines.slice(0, i + 1);
          buffer = lines.slice(i + 1).join('\r\n');
          if (waiter) { const w = waiter; waiter = null; w(reply); }
          return;
        }
      }
    }
    const read = () => new Promise((res) => { waiter = res; pump(); });
    const expect = async (...codes) => {
      const reply = await read();
      const code = reply[reply.length - 1].slice(0, 3);
      if (!codes.includes(code)) throw new Error(`SMTP ${reply.join(' ').slice(0, 200)}`);
      return reply;
    };
    const send = (line) => socket.write(line + '\r\n');

    async function run() {
      await expect('220');
      send(`EHLO ${'agentic.local'}`);
      let ehlo = await expect('250');
      if (!cfg.secure && ehlo.some(l => /STARTTLS/i.test(l)) && cfg.port !== 25) {
        send('STARTTLS');
        await expect('220');
        socket.removeListener('data', onData);
        socket = tls.connect({ socket, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized });
        socket.on('data', onData);
        socket.on('error', fail);
        await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
        send('EHLO agentic.local');
        ehlo = await expect('250');
      }
      if (cfg.user) {
        send('AUTH LOGIN');
        await expect('334');
        send(Buffer.from(cfg.user).toString('base64'));
        await expect('334');
        send(Buffer.from(cfg.pass).toString('base64'));
        await expect('235');
      }
      const bare = (a) => (String(a).match(/<([^>]+)>/) || [null, String(a)])[1].trim();
      send(`MAIL FROM:<${oneLine(bare(cfg.from))}>`);
      await expect('250');
      send(`RCPT TO:<${oneLine(bare(to))}>`);
      await expect('250', '251');
      send('DATA');
      await expect('354');
      const msg = buildMessage({ from: cfg.from, to, subject, text }).replace(/\r\n\./g, '\r\n..');
      socket.write(msg + '\r\n.\r\n');
      await expect('250');
      send('QUIT');
      finish();
    }

    const onConnect = () => run().catch(fail);
    socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized }, onConnect)
      : net.connect({ host: cfg.host, port: cfg.port }, onConnect);
    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('close', () => { if (!done) fail(new Error('SMTP connection closed')); });
  });
}

/** Stores the message in the outbox and returns its id. Delivery is a separate step. */
export function queueEmail(db, { kind, to, subject, body, ref = null }) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO agentic_email_outbox (id, kind, to_email, subject, body, related_ref) VALUES (?,?,?,?,?,?)')
    .run(id, kind, oneLine(to), oneLine(subject).slice(0, 250), String(body).slice(0, 50000), ref);
  return id;
}

export async function deliverEmail(db, id, env = process.env) {
  const row = db.prepare('SELECT * FROM agentic_email_outbox WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'not found' };
  if (row.status === 'SENT') return { ok: true, already: true };
  const cfg = mailerConfig(env);
  if (!cfg.configured) {
    db.prepare("UPDATE agentic_email_outbox SET last_error = ? WHERE id = ?").run('SMTP is not configured (SMTP_HOST, MAIL_FROM).', id);
    return { ok: false, error: 'SMTP is not configured' };
  }
  try {
    await smtpSend(cfg, { to: row.to_email, subject: row.subject, text: row.body });
    db.prepare("UPDATE agentic_email_outbox SET status = 'SENT', attempts = attempts + 1, sent_at = datetime('now'), last_error = NULL WHERE id = ?").run(id);
    return { ok: true };
  } catch (e) {
    db.prepare("UPDATE agentic_email_outbox SET status = 'FAILED', attempts = attempts + 1, last_error = ? WHERE id = ?").run(String(e.message).slice(0, 300), id);
    console.error('[Agentic mail]', row.kind, e.message);
    return { ok: false, error: e.message };
  }
}

/** Queue + attempt delivery. Never throws: a mail problem must not fail the customer's request. */
export async function sendNotification(db, msg, env = process.env) {
  try {
    if (!msg.to) return { ok: false, error: 'no recipient' };
    const id = queueEmail(db, msg);
    return { id, ...(await deliverEmail(db, id, env)) };
  } catch (e) {
    console.error('[Agentic mail]', e.message);
    return { ok: false, error: e.message };
  }
}

export function listOutbox(db, limit = 100) {
  return db.prepare(`SELECT id, kind, to_email AS "to", subject, related_ref AS ref, status, attempts, last_error AS error, created_at AS createdAt, sent_at AS sentAt
    FROM agentic_email_outbox ORDER BY created_at DESC LIMIT ?`).all(Math.min(500, Math.max(1, Number(limit) || 100)));
}
