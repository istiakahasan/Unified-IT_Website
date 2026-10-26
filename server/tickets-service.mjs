import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ATTACHMENTS_DIR = path.join(ROOT, 'data', 'attachments');

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// In-memory rate-limiter: stores last request timestamp per IP/key
const rateLimitMap = new Map();
export function checkRateLimit(key, windowMs = 60000, maxRequests = 10) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || [];
  const recent = entry.filter(ts => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    return false;
  }
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

// SLA Calculation (Hours based on priority)
export function calculateSlaDueDate(priority) {
  const p = (priority || 'NORMAL').toUpperCase();
  const now = new Date();
  let hours = 24;
  if (p === 'CRITICAL' || p === 'CRITICAL_24_7') {
    hours = 2;
  } else if (p === 'HIGH') {
    hours = 6;
  } else if (p === 'LOW') {
    hours = 72;
  } else {
    hours = 24; // NORMAL, MEDIUM, STANDARD
  }
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// Generate unique human-readable ticket reference
export function generateTicketNumber(db) {
  const year = new Date().getFullYear();
  for (let attempts = 0; attempts < 10; attempts++) {
    const rand = Math.floor(10000 + Math.random() * 90000);
    const candidate = `TCK-${year}-${rand}`;
    const exists = db.prepare('SELECT id FROM support_tickets WHERE ticket_number = ?').get(candidate);
    if (!exists) {
      return candidate;
    }
  }
  return `TCK-${year}-${Date.now().toString().slice(-5)}`;
}

// Log audit event
export function logTicketAudit(db, { ticketId, actorId, actorEmail, actorRole, action, prevStatus, newStatus, details }) {
  try {
    const id = 'aud-' + crypto.randomBytes(6).toString('hex');
    db.prepare(`
      INSERT INTO ticket_audit_events (id, ticket_id, actor_id, actor_email, actor_role, action, event_type, previous_status, new_status, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      ticketId,
      actorId || null,
      actorEmail || 'system@unified.cloud',
      actorRole || 'SYSTEM',
      action,
      action,
      prevStatus || null,
      newStatus || null,
      details ? JSON.stringify(details) : null
    );
  } catch (err) {
    console.error('[Ticket Audit Error]', err.message);
  }
}

// Create Ticket
export function createTicket(db, data, actor = {}) {
  const {
    subject,
    description,
    message,
    category,
    department,
    priority = 'NORMAL',
    customerId = null,
    partnerId = null,
    requesterName,
    requesterEmail,
    buyerName = null,
    buyerEmail = null,
    buyerPhone = null,
    relatedServiceId = null,
    relatedOrderId = null,
    relatedProductCode = null,
    preferredContact = 'EMAIL',
    attachments = []
  } = data;

  const content = (message || description || '').trim();
  const subj = (subject || '').trim();
  const reqEmail = (requesterEmail || buyerEmail || '').trim().toLowerCase();
  const reqName = (requesterName || buyerName || reqEmail.split('@')[0] || 'Customer').trim();

  if (!subj || subj.length < 3) {
    throw new Error('Ticket subject is required (minimum 3 characters).');
  }
  if (!content || content.length < 5) {
    throw new Error('Detailed issue description is required (minimum 5 characters).');
  }
  if (!reqEmail || !reqEmail.includes('@')) {
    throw new Error('Valid email address is required.');
  }

  const ticketId = 'tck-' + crypto.randomBytes(8).toString('hex');
  const ticketNum = generateTicketNumber(db);
  const cat = (category || department || 'TECHNICAL').toUpperCase();
  const prio = (priority || 'NORMAL').toUpperCase();
  const slaDue = calculateSlaDueDate(prio);

  const initialStatus = 'OPEN';
  const role = actor.role || (actor.userId ? 'CUSTOMER' : 'GUEST');

  db.prepare(`
    INSERT INTO support_tickets (
      id, ticket_number, customer_id, partner_id, requester_email, requester_name,
      buyer_name, buyer_email, buyer_phone, department, category, priority, status,
      subject, message, assigned_to, related_service_id, related_order_id, related_product_code,
      preferred_contact, created_by_user_id, created_by_role, is_escalated, sla_due_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, NULL, ?, ?, ?,
      ?, ?, ?, 0, ?,
      datetime('now'), datetime('now')
    )
  `).run(
    ticketId,
    ticketNum,
    customerId || null,
    partnerId || null,
    reqEmail,
    reqName,
    buyerName || reqName,
    buyerEmail || reqEmail,
    buyerPhone || null,
    cat,
    cat,
    prio,
    initialStatus,
    subj,
    content,
    relatedServiceId || null,
    relatedOrderId || null,
    relatedProductCode || null,
    preferredContact || 'EMAIL',
    actor.userId || null,
    role,
    slaDue
  );

  // Add initial message to ticket_messages
  const msgId = 'msg-' + crypto.randomBytes(6).toString('hex');
  const authorType = role.includes('PARTNER') ? 'PARTNER' : (role.includes('ADMIN') ? 'STAFF' : 'CUSTOMER');
  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_type, author_id, author_name, author_email, message, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(
    msgId,
    ticketId,
    authorType,
    actor.userId || null,
    reqName,
    reqEmail,
    content
  );

  // Also write to ticket_replies for backward compatibility
  try {
    db.prepare(`
      INSERT INTO ticket_replies (id, ticket_id, author_type, author_name, author_email, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(msgId, ticketId, authorType, reqName, reqEmail, content);
  } catch (_) {}

  // Handle attachments if provided
  if (Array.isArray(attachments) && attachments.length > 0) {
    const insertAtt = db.prepare(`
      INSERT INTO ticket_attachments (id, ticket_id, message_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const att of attachments) {
      if (att.fileName && att.filePath) {
        const attId = 'att-' + crypto.randomBytes(6).toString('hex');
        insertAtt.run(
          attId,
          ticketId,
          msgId,
          att.fileName,
          att.filePath,
          att.fileSize || 0,
          att.mimeType || 'application/octet-stream',
          reqEmail
        );
      }
    }
  }

  // Audit event
  logTicketAudit(db, {
    ticketId,
    actorId: actor.userId,
    actorEmail: reqEmail,
    actorRole: role,
    action: 'TICKET_CREATED',
    prevStatus: null,
    newStatus: 'OPEN',
    details: { ticketNum, subject: subj, priority: prio, category: cat, partnerId }
  });

  return {
    ticketId,
    ticketNumber: ticketNum,
    status: initialStatus,
    slaDueDate: slaDue,
    subject: subj
  };
}

// Add Reply
export function addReply(db, ticketId, { message, isInternal = false, attachments = [] }, actor = {}) {
  const content = (message || '').trim();
  if (!content || content.length < 2) {
    throw new Error('Reply message cannot be empty.');
  }

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const role = actor.role || 'CUSTOMER';
  const isAdminOrStaff = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN'].includes(role);
  const isPartner = role === 'PARTNER';

  // Only admins/staff can author internal notes
  const internalFlag = isAdminOrStaff && Boolean(isInternal) ? 1 : 0;

  let authorType = 'CUSTOMER';
  if (isAdminOrStaff) {
    authorType = 'STAFF';
  } else if (isPartner) {
    authorType = 'PARTNER';
  }

  const authorName = actor.name || actor.email?.split('@')[0] || (isAdminOrStaff ? 'Support Engineer' : (isPartner ? 'Partner Support' : 'Customer'));
  const authorEmail = actor.email || ticket.requester_email;

  const msgId = 'msg-' + crypto.randomBytes(6).toString('hex');

  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_type, author_id, author_name, author_email, message, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    msgId,
    ticket.id,
    authorType,
    actor.userId || null,
    authorName,
    authorEmail,
    content,
    internalFlag
  );

  // Also write to ticket_replies if public
  if (!internalFlag) {
    try {
      db.prepare(`
        INSERT INTO ticket_replies (id, ticket_id, author_type, author_name, author_email, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(msgId, ticket.id, authorType, authorName, authorEmail, content);
    } catch (_) {}
  }

  // Handle attachments
  if (Array.isArray(attachments) && attachments.length > 0) {
    const insertAtt = db.prepare(`
      INSERT INTO ticket_attachments (id, ticket_id, message_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const att of attachments) {
      if (att.fileName && att.filePath) {
        const attId = 'att-' + crypto.randomBytes(6).toString('hex');
        insertAtt.run(
          attId,
          ticket.id,
          msgId,
          att.fileName,
          att.filePath,
          att.fileSize || 0,
          att.mimeType || 'application/octet-stream',
          authorEmail
        );
      }
    }
  }

  // Determine status transition if public reply
  let newStatus = ticket.status;
  if (!internalFlag) {
    if (isAdminOrStaff) {
      // If escalated and staff replies, can remain ESCALATED or move to WAITING_RESELLER / WAITING_BUYER
      newStatus = ticket.partner_id ? 'WAITING_RESELLER' : 'WAITING_BUYER';
    } else if (isPartner) {
      newStatus = 'WAITING_BUYER';
    } else {
      // Buyer / customer replied
      newStatus = ticket.is_escalated ? 'ESCALATED' : (ticket.partner_id ? 'WAITING_RESELLER' : 'IN_PROGRESS');
    }

    db.prepare(`
      UPDATE support_tickets 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, ticket.id);
  } else {
    // Just update timestamp on internal note
    db.prepare(`UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  }

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: authorEmail,
    actorRole: role,
    action: internalFlag ? 'INTERNAL_NOTE_ADDED' : 'REPLY_POSTED',
    prevStatus: ticket.status,
    newStatus,
    details: { msgId, isInternal: Boolean(internalFlag) }
  });

  return {
    replyId: msgId,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    status: newStatus,
    isInternal: Boolean(internalFlag),
    createdAt: new Date().toISOString()
  };
}

// Update Ticket Status
export function updateTicketStatus(db, ticketId, newStatus, actor = {}, reason = '') {
  const allowed = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_BUYER', 'WAITING_RESELLER', 'ESCALATED', 'RESOLVED', 'CLOSED'];
  const status = (newStatus || '').toUpperCase();
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status '${newStatus}'. Allowed: ${allowed.join(', ')}`);
  }

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const role = actor.role || 'STAFF';
  const isPartner = role === 'PARTNER';

  // Partner authorization check: partner can only modify their own buyer's ticket, and only to RESOLVED, IN_PROGRESS, or WAITING_BUYER
  if (isPartner) {
    if (ticket.partner_id !== actor.partnerId) {
      throw new Error('Access denied: You cannot alter tickets belonging to another reseller or account.');
    }
    if (!['RESOLVED', 'IN_PROGRESS', 'WAITING_BUYER'].includes(status)) {
      throw new Error(`Resellers can only transition tickets to IN_PROGRESS, WAITING_BUYER, or RESOLVED.`);
    }
  }

  let resolvedAt = ticket.resolved_at;
  let closedAt = ticket.closed_at;
  if (status === 'RESOLVED') {
    resolvedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  } else if (status === 'CLOSED') {
    closedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  } else if (['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(status)) {
    // Reopening
    resolvedAt = null;
    closedAt = null;
  }

  db.prepare(`
    UPDATE support_tickets 
    SET status = ?, resolved_at = ?, closed_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, resolvedAt, closedAt, ticket.id);

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: actor.email || 'staff@unified.cloud',
    actorRole: role,
    action: 'STATUS_UPDATED',
    prevStatus: ticket.status,
    newStatus: status,
    details: { reason }
  });

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    previousStatus: ticket.status,
    status
  };
}

// Escalate Ticket (Reseller or Admin)
export function escalateTicket(db, ticketId, actor = {}, reason = '') {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const role = actor.role || 'STAFF';
  if (role === 'PARTNER' && ticket.partner_id !== actor.partnerId) {
    throw new Error('Access denied: You cannot escalate tickets outside your partner domain.');
  }

  const escReason = (reason || '').trim() || 'Escalated by partner to Unified IT Cloud Operations NOC';
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    UPDATE support_tickets 
    SET is_escalated = 1, status = 'ESCALATED', escalated_at = ?, escalated_by = ?, escalation_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(now, actor.email || 'partner@unified.cloud', escReason, ticket.id);

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: role,
    action: 'TICKET_ESCALATED',
    prevStatus: ticket.status,
    newStatus: 'ESCALATED',
    details: { reason: escReason, escalatedAt: now }
  });

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    status: 'ESCALATED',
    isEscalated: true,
    escalatedAt: now,
    escalationReason: escReason
  };
}

// De-escalate Ticket (Admin NOC only)
export function deescalateTicket(db, ticketId, actor = {}, reason = '') {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const deescReason = (reason || 'De-escalated by platform NOC engineer').trim();

  db.prepare(`
    UPDATE support_tickets 
    SET is_escalated = 0, status = 'IN_PROGRESS', updated_at = datetime('now')
    WHERE id = ?
  `).run(ticket.id);

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role || 'ADMIN',
    action: 'TICKET_DEESCALATED',
    prevStatus: ticket.status,
    newStatus: 'IN_PROGRESS',
    details: { reason: deescReason }
  });

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    status: 'IN_PROGRESS',
    isEscalated: false
  };
}

// Assign Ticket (Admin only)
export function assignTicket(db, ticketId, assignedTo, actor = {}) {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const agent = (assignedTo || '').trim();
  let newStatus = ticket.status;
  if (agent && ticket.status === 'OPEN') {
    newStatus = 'ASSIGNED';
  } else if (!agent && ticket.status === 'ASSIGNED') {
    newStatus = 'OPEN';
  }

  db.prepare(`
    UPDATE support_tickets 
    SET assigned_to = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(agent || null, newStatus, ticket.id);

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role || 'ADMIN',
    action: 'TICKET_ASSIGNED',
    prevStatus: ticket.status,
    newStatus,
    details: { assignedTo: agent || null }
  });

  return {
    ticketId: ticket.id,
    assignedTo: agent || null,
    status: newStatus
  };
}

// Update Ticket Priority
export function updateTicketPriority(db, ticketId, priority, actor = {}) {
  const prio = (priority || 'NORMAL').toUpperCase();
  const allowed = ['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL', 'STANDARD', 'CRITICAL_24_7'];
  if (!allowed.includes(prio)) {
    throw new Error(`Invalid priority '${priority}'.`);
  }

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?').get(ticketId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket '${ticketId}' not found.`);
  }

  const slaDue = calculateSlaDueDate(prio);

  db.prepare(`
    UPDATE support_tickets 
    SET priority = ?, sla_due_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(prio, slaDue, ticket.id);

  logTicketAudit(db, {
    ticketId: ticket.id,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role || 'ADMIN',
    action: 'PRIORITY_CHANGED',
    prevStatus: ticket.status,
    newStatus: ticket.status,
    details: { previousPriority: ticket.priority, newPriority: prio, slaDue }
  });

  return {
    ticketId: ticket.id,
    priority: prio,
    slaDueDate: slaDue
  };
}

// Get Ticket Details with RBAC and Internal Note Masking
export function getTicketDetails(db, ticketId, actor = {}, guestEmail = null) {
  const ticket = db.prepare(`
    SELECT t.*, 
           c.company_name as customer_company, 
           c.phone as customer_phone,
           p.company_name as partner_company,
           p.email as partner_email,
           p.contact_name as partner_contact_name
    FROM support_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN partners p ON t.partner_id = p.id
    WHERE t.id = ? OR t.ticket_number = ?
  `).get(ticketId, ticketId);

  if (!ticket) {
    return null;
  }

  const role = actor.role || (actor.userId ? 'CUSTOMER' : 'GUEST');
  const isAdminOrStaff = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN', 'AUDITOR'].includes(role);
  const isPartner = role === 'PARTNER';

  // Check authorization
  if (isAdminOrStaff) {
    // Full visibility
  } else if (isPartner) {
    if (ticket.partner_id !== actor.partnerId) {
      throw new Error('Tenant access violation: You do not have permission to view tickets outside your partner domain.');
    }
  } else if (actor.userId && actor.customerId) {
    if (ticket.customer_id !== actor.customerId && ticket.requester_email !== actor.email) {
      throw new Error('Access denied: You do not have permission to view this ticket.');
    }
  } else if (guestEmail) {
    // Guest verification requires exact email match
    if (ticket.requester_email.toLowerCase() !== guestEmail.toLowerCase()) {
      throw new Error('Verification failed: Email address does not match ticket records.');
    }
  } else {
    throw new Error('Authentication or email verification required to access ticket.');
  }

  // Load messages: ONLY admin staff get is_internal = 1 notes!
  let messagesSql = `SELECT * FROM ticket_messages WHERE ticket_id = ?`;
  if (!isAdminOrStaff) {
    messagesSql += ` AND is_internal = 0`;
  }
  messagesSql += ` ORDER BY created_at ASC`;

  const messages = db.prepare(messagesSql).all(ticket.id);

  // Load attachments
  const attachments = db.prepare(`
    SELECT id, message_id, file_name, file_size, mime_type, uploaded_by, created_at
    FROM ticket_attachments 
    WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(ticket.id);

  // Load audit trail (admin staff only)
  let auditEvents = [];
  if (isAdminOrStaff) {
    auditEvents = db.prepare(`
      SELECT * FROM ticket_audit_events WHERE ticket_id = ? ORDER BY created_at DESC
    `).all(ticket.id);
  }

  return {
    ticket,
    messages,
    attachments,
    auditEvents
  };
}

// Admin Overview KPIs
export function getAdminOverview(db) {
  const total = db.prepare('SELECT COUNT(*) as count FROM support_tickets').get()?.count || 0;
  
  const unassigned = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE assigned_to IS NULL AND status NOT IN ('RESOLVED', 'CLOSED')
  `).get()?.count || 0;

  const openAndInProgress = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
  `).get()?.count || 0;

  const highCritical = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE priority IN ('HIGH', 'CRITICAL', 'CRITICAL_24_7') AND status NOT IN ('RESOLVED', 'CLOSED')
  `).get()?.count || 0;

  const waitingResponse = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE status IN ('WAITING_BUYER', 'WAITING_RESELLER')
  `).get()?.count || 0;

  const escalated = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE (is_escalated = 1 OR status = 'ESCALATED') AND status NOT IN ('RESOLVED', 'CLOSED')
  `).get()?.count || 0;

  const resolvedClosed = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE status IN ('RESOLVED', 'CLOSED')
  `).get()?.count || 0;

  const slaApproachingOrBreached = db.prepare(`
    SELECT COUNT(*) as count FROM support_tickets 
    WHERE sla_due_at IS NOT NULL 
      AND status NOT IN ('RESOLVED', 'CLOSED')
      AND sla_due_at <= datetime('now', '+2 hours')
  `).get()?.count || 0;

  return {
    total,
    unassigned,
    openAndInProgress,
    highCritical,
    waitingResponse,
    escalated,
    resolvedClosed,
    slaApproachingOrBreached
  };
}

// Admin Ticket List with server-side pagination, search & filters
export function getAdminTickets(db, query = {}) {
  const {
    status,
    priority,
    category,
    department,
    partnerId,
    escalated,
    search,
    limit = 25,
    offset = 0,
    sortBy = 'updated_at',
    sortDir = 'DESC'
  } = query;

  let whereClauses = ['1=1'];
  const params = [];

  if (status && status !== 'ALL') {
    whereClauses.push('t.status = ?');
    params.push(status);
  }
  if (priority && priority !== 'ALL') {
    whereClauses.push('t.priority = ?');
    params.push(priority);
  }
  if (category && category !== 'ALL') {
    whereClauses.push('(t.category = ? OR t.department = ?)');
    params.push(category, category);
  }
  if (department && department !== 'ALL') {
    whereClauses.push('(t.department = ? OR t.category = ?)');
    params.push(department, department);
  }
  if (partnerId) {
    whereClauses.push('t.partner_id = ?');
    params.push(partnerId);
  }
  if (escalated === '1' || escalated === 'true') {
    whereClauses.push('(t.is_escalated = 1 OR t.status = "ESCALATED")');
  }
  if (search) {
    whereClauses.push(`(
      t.ticket_number LIKE ? OR 
      t.subject LIKE ? OR 
      t.requester_email LIKE ? OR 
      t.requester_name LIKE ? OR 
      t.buyer_name LIKE ? OR
      c.company_name LIKE ? OR
      p.company_name LIKE ?
    )`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s, s);
  }

  const whereStr = whereClauses.join(' AND ');

  const totalRow = db.prepare(`
    SELECT COUNT(*) as count 
    FROM support_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN partners p ON t.partner_id = p.id
    WHERE ${whereStr}
  `).get(...params);

  const total = totalRow?.count || 0;

  const validSortCols = ['created_at', 'updated_at', 'priority', 'status', 'ticket_number', 'sla_due_at'];
  const sortCol = validSortCols.includes(sortBy) ? sortBy : 'updated_at';
  const orderDir = (sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const lim = Math.max(1, Math.min(100, Number(limit) || 25));
  const off = Math.max(0, Number(offset) || 0);

  const tickets = db.prepare(`
    SELECT t.*, 
           c.company_name as customer_company, 
           p.company_name as partner_company
    FROM support_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN partners p ON t.partner_id = p.id
    WHERE ${whereStr}
    ORDER BY t.${sortCol} ${orderDir}
    LIMIT ? OFFSET ?
  `).all(...params, lim, off);

  return {
    tickets,
    total,
    limit: lim,
    offset: off,
    page: Math.floor(off / lim) + 1,
    totalPages: Math.ceil(total / lim)
  };
}

// Partner Ticket List (Strictly Isolated to Partner)
export function getPartnerTickets(db, partnerId, query = {}) {
  if (!partnerId) {
    throw new Error('Partner ID is required.');
  }

  const { status, search, limit = 50, offset = 0 } = query;
  let whereClauses = ['t.partner_id = ?'];
  const params = [partnerId];

  if (status && status !== 'ALL') {
    whereClauses.push('t.status = ?');
    params.push(status);
  }
  if (search) {
    whereClauses.push('(t.ticket_number LIKE ? OR t.subject LIKE ? OR t.buyer_name LIKE ? OR t.buyer_email LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const whereStr = whereClauses.join(' AND ');

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM support_tickets t WHERE ${whereStr}`).get(...params);
  const total = totalRow?.count || 0;

  const lim = Math.max(1, Math.min(100, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);

  const tickets = db.prepare(`
    SELECT t.*, 
           rel.customer_name as managed_customer_name,
           rel.company as managed_customer_company
    FROM support_tickets t
    LEFT JOIN partner_customer_relationships rel ON t.customer_id = rel.id
    WHERE ${whereStr}
    ORDER BY t.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, off);

  // Metrics for partner header
  const partnerMetrics = {
    total,
    open: db.prepare(`SELECT COUNT(*) as count FROM support_tickets WHERE partner_id = ? AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_RESELLER')`).get(partnerId)?.count || 0,
    escalated: db.prepare(`SELECT COUNT(*) as count FROM support_tickets WHERE partner_id = ? AND (is_escalated = 1 OR status = 'ESCALATED') AND status NOT IN ('RESOLVED', 'CLOSED')`).get(partnerId)?.count || 0,
    resolved: db.prepare(`SELECT COUNT(*) as count FROM support_tickets WHERE partner_id = ? AND status IN ('RESOLVED', 'CLOSED')`).get(partnerId)?.count || 0
  };

  return {
    tickets,
    total,
    metrics: partnerMetrics,
    limit: lim,
    offset: off
  };
}

// Get Partner Customers for Ticket Creation Dropdown
export function getPartnerCustomers(db, partnerId) {
  if (!partnerId) return [];
  const customers = db.prepare(`
    SELECT id, customer_name, customer_email, company, status, created_at
    FROM partner_customer_relationships
    WHERE partner_id = ? AND status = 'ACTIVE'
    ORDER BY customer_name ASC
  `).all(partnerId);

  const services = db.prepare(`
    SELECT id, customer_id, service_name, product_code, ip_address, status
    FROM partner_services
    WHERE partner_id = ? AND status = 'RUNNING'
  `).all(partnerId);

  return customers.map(c => ({
    ...c,
    services: services.filter(s => s.customer_id === c.id)
  }));
}
