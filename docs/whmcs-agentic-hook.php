<?php
/**
 * SAMPLE WHMCS hook: reports invoice events to the Unified Cloud Agentic AI webhook.
 *
 * Install as /includes/hooks/unified_agentic.php on the WHMCS server and fill in the two constants.
 * This file has NOT been tested against a live WHMCS. Check the hook names and the GetTransactions
 * response against your WHMCS version before relying on it.
 *
 * The request body is signed with HMAC-SHA256 using the same secret as AGENTIC_WEBHOOK_SECRET on the
 * Unified Cloud server, sent in the X-Unified-Signature header as "sha256=<hex>".
 * Only invoices created for Agentic AI orders are known to the server; others receive a 404 and are ignored.
 */
if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

const UNIFIED_AGENTIC_WEBHOOK_URL = 'https://YOUR-DOMAIN/api/webhooks/whmcs/agentic';
const UNIFIED_AGENTIC_WEBHOOK_SECRET = 'SAME_VALUE_AS_AGENTIC_WEBHOOK_SECRET';

function unified_agentic_notify(string $event, int $invoiceId, ?string $transactionId = null, ?float $amount = null): void
{
    $payload = ['event' => $event, 'invoiceId' => (string) $invoiceId];
    if ($transactionId !== null) {
        $payload['transactionId'] = $transactionId;
    }
    if ($amount !== null) {
        $payload['amount'] = $amount;
    }
    $body = json_encode($payload);
    $signature = 'sha256=' . hash_hmac('sha256', $body, UNIFIED_AGENTIC_WEBHOOK_SECRET);

    $ch = curl_init(UNIFIED_AGENTIC_WEBHOOK_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Unified-Signature: ' . $signature],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

add_hook('InvoicePaid', 1, function ($vars) {
    $invoiceId = (int) $vars['invoiceid'];
    $invoice = localAPI('GetInvoice', ['invoiceid' => $invoiceId]);
    $tx = localAPI('GetTransactions', ['invoiceid' => $invoiceId]);
    $first = $tx['transactions']['transaction'][0] ?? null;
    $transactionId = $first['transid'] ?? ('invoice-' . $invoiceId);
    unified_agentic_notify('InvoicePaid', $invoiceId, (string) $transactionId, (float) ($invoice['total'] ?? 0));
});

add_hook('InvoiceCancelled', 1, function ($vars) {
    unified_agentic_notify('InvoiceCancelled', (int) $vars['invoiceid']);
});

add_hook('InvoiceRefunded', 1, function ($vars) {
    unified_agentic_notify('InvoiceRefunded', (int) $vars['invoiceid'], 'refund-' . (int) $vars['invoiceid'] . '-' . time());
});

add_hook('InvoiceUnpaid', 1, function ($vars) {
    unified_agentic_notify('InvoiceUnpaid', (int) $vars['invoiceid'], 'unpaid-' . (int) $vars['invoiceid'] . '-' . time());
});

// "PaymentFailed" has no standard WHMCS hook; call unified_agentic_notify('PaymentFailed', $invoiceId, $reference)
// from your gateway module's failure handler if you want failed attempts recorded.
