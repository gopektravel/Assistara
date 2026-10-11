/**
 * Centralized Email Delivery Module for Assistara
 * Used by all transactional email Edge Functions
 * Provider priority: Resend → Brevo → Sender.net
 */

// No custom tracking — we rely on provider-native tracking (Resend, Brevo, Sender)
// via their webhooks and APIs. The gateway only ensures:
//   * idempotency, suppression, quota, fallback, previews
//   * native tracking headers are passed through to providers that support them

// Utility: base64 encode Uint8Array
function b64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(out);
}

// Shared types
export interface EmailProviderConfig {
  provider: 'resend' | 'brevo' | 'sender';
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  domain: string;
  dailyLimit: number;
  monthlyLimit: number;
  rateLimitPerSec: number;
  rateLimitPerMin: number;
}

export interface EmailAttachment {
  filename: string;
  content: Uint8Array | string; // Uint8Array for binary, base64 string for pre-encoded
  contentType?: string; // optional, inferred from filename if not provided
  disposition?: 'attachment' | 'inline';
  contentId?: string; // for inline/CID references
}

export interface EmailDeliveryOptions {
  idempotencyKey: string;
  emailType: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  deadline?: Date; // Hard deadline - email must not send after this
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
  forceProvider?: 'resend' | 'brevo' | 'sender'; // test-only: pin a single provider
  fromName?: string; // sender display-name override (per email identity)
  campaignKey?: string; // campaign grouping used by the Email Command Center
  recipientId?: string; // recipient ref (e.g. masterclass signup id) for the timeline
  attachments?: EmailAttachment[]; // optional attachments (PDF receipts, inline images, etc.)
}

export interface EmailDeliveryResult {
  success: boolean;
  provider: 'resend' | 'brevo' | 'sender' | null;
  providerMessageId: string | null;
  status: 'sent' | 'failed' | 'unknown' | 'expired' | 'suppressed';
  error?: string;
  errorCategory?: 'provider_auth' | 'provider_quota' | 'provider_rate_limit' | 'provider_server' | 'network_timeout' | 'network_error' | 'unknown';
  attempts: number;
}

export interface ProviderHealth {
  provider: 'resend' | 'brevo' | 'sender';
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastErrorCategory: string | null;
}

// Quota reservation state
interface QuotaReservation {
  provider: string;
  count: number;
  reserved: boolean;
}

// Rate limiter using token bucket (per provider, in-memory per instance)
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async take(tokens = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }
      // Wait for next token
      const waitMs = Math.ceil((tokens - this.tokens) / this.refillRate * 1000);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);
    this.lastRefill = now;
  }
}

// Main email delivery class
export class EmailDelivery {
  private supabaseUrl: string;
  private supabaseKey: string;
  private providers: Map<string, EmailProviderConfig> = new Map();
  private rateLimiters: Map<string, TokenBucket> = new Map();
  private workerId: string;

  constructor(supabaseUrl: string, supabaseKey: string, workerId?: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.workerId = workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
  }

  async initialize(): Promise<void> {
    // Load provider configs from database
    const response = await fetch(`${this.supabaseUrl}/rest/v1/email_provider_config?is_enabled=eq.true&order=priority.asc`, {
      headers: { apikey: this.supabaseKey, Authorization: `Bearer ${this.supabaseKey}` }
    });
    const configs = await response.json();

    for (const c of configs) {
      const apiKey = Deno.env.get(c.api_key_name) || '';
      if (!apiKey) {
        console.warn(`Provider ${c.provider}: API key secret ${c.api_key_name} not set`);
        continue;
      }
      this.providers.set(c.provider, {
        provider: c.provider,
        apiKey,
        fromEmail: c.from_email,
        fromName: c.from_name,
        replyToEmail: c.reply_to_email || c.from_email,
        domain: c.domain,
        dailyLimit: c.daily_limit_override || this.getDefaultDailyLimit(c.provider, c.account_tier),
        monthlyLimit: c.monthly_limit_override || this.getDefaultMonthlyLimit(c.provider, c.account_tier),
        rateLimitPerSec: c.rate_limit_per_sec || this.getDefaultRateLimit(c.provider),
        rateLimitPerMin: c.rate_limit_per_min || 60,
      });
      this.rateLimiters.set(c.provider, new TokenBucket(
        this.providers.get(c.provider)!.rateLimitPerSec,
        this.providers.get(c.provider)!.rateLimitPerSec
      ));
    }
  }

  private getDefaultDailyLimit(provider: string, tier?: string): number {
    const limits: Record<string, Record<string, number>> = {
      resend: { free: 100, pro: 50000, enterprise: 1000000 },
      brevo: { free: 300, pro: 100000, enterprise: 1000000 },
      sender: { free: 1000, pro: 50000, enterprise: 1000000 },
    };
    return limits[provider]?.[tier || 'free'] || 100;
  }

  private getDefaultMonthlyLimit(provider: string, tier?: string): number {
    const limits: Record<string, Record<string, number>> = {
      resend: { free: 3000, pro: 500000, enterprise: 10000000 },
      brevo: { free: 9000, pro: 1000000, enterprise: 10000000 },
      sender: { free: 30000, pro: 500000, enterprise: 10000000 },
    };
    return limits[provider]?.[tier || 'free'] || 3000;
  }

  private getDefaultRateLimit(provider: string): number {
    return { resend: 2, brevo: 10, sender: 10 }[provider] || 2;
  }

  /**
   * Send email with automatic provider fallback and quota management
   */
  async send(options: EmailDeliveryOptions): Promise<EmailDeliveryResult> {
    const { idempotencyKey, emailType, to, subject, html, text, deadline, maxAttempts = 3 } = options;

    // Check deadline before attempting
    if (deadline && new Date() > deadline) {
      await this.updateDeliveryLog(idempotencyKey, {
        status: 'expired',
        last_error: 'Deadline exceeded before send attempt',
        last_error_category: 'unknown'
      });
      return { success: false, provider: null, providerMessageId: null, status: 'expired', error: 'Deadline exceeded', errorCategory: 'unknown', attempts: 0 };
    }

    // Atomic claim for exactly-once
    const claimed = await this.claimDelivery(idempotencyKey);
    if (!claimed) {
      // Check existing log for status
      const existing = await this.getDeliveryLog(idempotencyKey);
      if (existing) {
        return {
          success: existing.status === 'sent',
          provider: existing.provider as any,
          providerMessageId: existing.provider_message_id,
          status: existing.status,
          error: existing.last_error,
          errorCategory: existing.last_error_category as any,
          attempts: existing.attempts
        };
      }
      return { success: false, provider: null, providerMessageId: null, status: 'failed', error: 'Could not claim delivery', errorCategory: 'unknown', attempts: 0 };
    }

    try {
      // Email Command Center bookkeeping (all best-effort; never blocks a send).
      const logRow = await this.getDeliveryLog(idempotencyKey);
      const logId: string | null = logRow?.id ?? null;

      // Global suppression (unsubscribe / hard bounce / complaint) shared by all
      // three providers. Fail-open: if the lookup itself fails we still send.
      if (await this.isSuppressed(to)) {
        await this.updateDeliveryLog(idempotencyKey, {
          status: 'suppressed',
          last_error: 'Recipient is on the global suppression list',
          last_error_category: 'unknown'
        });
        return { success: false, provider: null, providerMessageId: null, status: 'suppressed', error: 'Recipient suppressed', errorCategory: 'unknown', attempts: 0 };
      }

      if (logId) {
        if (options.campaignKey || options.recipientId) {
          await this.updateDeliveryLog(idempotencyKey, {
            ...(options.campaignKey ? { campaign_key: options.campaignKey } : {}),
            ...(options.recipientId ? { recipient_id: options.recipientId } : {}),
          });
        }
        // Capture the exact rendered copy so the Command Center can show a true
        // preview of what recipients actually received.
        await this.captureRender(logId, options);
      }

      // Get available providers in priority order
      let providers = await this.getAvailableProviders(1);
      // Test-only: pin a single provider (still respects enabled/cooldown/quota)
      if (options.forceProvider) {
        providers = providers.filter((p) => p.provider === options.forceProvider);
        if (providers.length === 0) {
          throw new Error(`Forced provider ${options.forceProvider} is not available (disabled, in cooldown, or quota exhausted)`);
        }
      }
      if (providers.length === 0) {
        throw new Error('No available providers (all in cooldown or quota exhausted)');
      }

      let lastError: Error | null = null;
      let lastCategory: EmailDeliveryResult['errorCategory'] = 'unknown';
      let attemptNo = 0;

      for (const provider of providers) {
        // Reserve quota
        const reserved = await this.reserveQuota(provider.provider, 1);
        if (!reserved) {
          console.warn(`Quota exhausted for ${provider.provider}, trying next`);
          continue;
        }

        // Rate limit
        await this.rateLimiters.get(provider.provider)?.take(1);

        try {
          attemptNo++;
          const result = await this.sendViaProvider(provider, options);
          await this.recordAttempt(logId, idempotencyKey, provider.provider, attemptNo, result);

          if (result.success) {
            // Record success
            await this.recordProviderSuccess(provider.provider);
            await this.updateDeliveryLog(idempotencyKey, {
              status: 'sent',
              provider: provider.provider,
              provider_message_id: result.providerMessageId,
              sent_at: new Date().toISOString()
            });
            return { ...result, attempts: 1 };
          }

          // Definitive failure - don't retry with same provider
          if (result.errorCategory === 'provider_auth') {
            await this.recordProviderFailure(provider.provider, 'provider_auth');
            await this.releaseQuota(provider.provider, 1);
            await this.updateDeliveryLog(idempotencyKey, {
              status: 'failed',
              provider: provider.provider,
              attempts: 1,
              last_error: result.error?.message,
              last_error_category: 'provider_auth',
            });
            return { success: false, provider: provider.provider, providerMessageId: null, status: 'failed', error: result.error?.message, errorCategory: 'provider_auth', attempts: 1 };
          }
          if (result.errorCategory === 'provider_quota') {
            await this.recordProviderFailure(provider.provider, 'provider_quota');
            await this.releaseQuota(provider.provider, 1);
            continue; // Try next provider
          }

          // Ambiguous failure (5xx, timeout, network) - mark UNKNOWN, reconcile later
          lastError = result.error;
          lastCategory = result.errorCategory;
          await this.recordProviderFailure(provider.provider, result.errorCategory);
          await this.releaseQuota(provider.provider, 1);
          
          // Don't automatically fallback for ambiguous failures
          // Instead, mark as UNKNOWN and let reconciliation handle it
          await this.updateDeliveryLog(idempotencyKey, {
            status: 'unknown',
            provider: provider.provider,
            attempts: 1,
            last_error: result.error?.message,
            last_error_category: result.errorCategory
          });
          
          // For masterclass reminders, we CANNOT retry after deadline
          if (deadline && new Date() > deadline) {
            await this.updateDeliveryLog(idempotencyKey, { status: 'expired' });
            return { success: false, provider: null, providerMessageId: null, status: 'expired', error: 'Deadline exceeded after ambiguous failure', errorCategory: 'unknown', attempts: 1 };
          }
          
          // Return UNKNOWN - requires manual/human reconciliation before retry
          return { 
            success: false, 
            provider: provider.provider, 
            providerMessageId: null, 
            status: 'unknown', 
            error: result.error?.message, 
            errorCategory: result.errorCategory, 
            attempts: 1 
          };

        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          await this.releaseQuota(provider.provider, 1);
          await this.recordAttempt(logId, idempotencyKey, provider.provider, attemptNo, {
            success: false, provider: provider.provider as any, providerMessageId: null,
            status: 'failed', error: lastError, errorCategory: 'unknown', attempts: 1
          });
          const errMsg = lastError.message.toLowerCase();
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('invalid') || errMsg.includes('unauthorized')) {
            await this.recordProviderFailure(provider.provider, 'provider_auth');
            throw lastError;
          }
          if (errMsg.includes('402') || errMsg.includes('quota')) {
            await this.recordProviderFailure(provider.provider, 'provider_quota');
            continue;
          }
          // Other errors - continue to next provider
        }
      }

      // All providers exhausted
      await this.updateDeliveryLog(idempotencyKey, {
        status: 'failed',
        last_error: lastError?.message || 'All providers exhausted',
        last_error_category: lastCategory
      });
      throw lastError || new Error('All providers exhausted');

    } finally {
      await this.releaseClaim(idempotencyKey);
    }
  }

  private async sendViaProvider(provider: EmailProviderConfig, options: EmailDeliveryOptions): Promise<EmailDeliveryResult> {
    const { to, toName, subject, html, text, replyTo, idempotencyKey, attachments } = options;
    const fromName = options.fromName || provider.fromName;
    
    // Helper to convert attachments to base64
    const encodeAttachments = (atts: EmailAttachment[]): string[] => {
      return atts.map(a => {
        const content = a.content instanceof Uint8Array 
          ? b64(a.content) 
          : String(a.content); // assume already base64
        return content;
      });
    };

    // Helper to guess content type from filename
    function guessContentType(filename: string): string {
      if (filename.endsWith('.pdf')) return 'application/pdf';
      const m = filename.match(/\.(png|jpg|jpeg|gif)$/i);
      if (m) return `image/${m[1].toLowerCase()}`;
      return 'application/octet-stream';
    }

    // Helper to convert attachments to Resend format
    const toResendAttachments = (atts: EmailAttachment[]) => {
      return atts.map(a => {
        return {
          filename: a.filename,
          content: a.content instanceof Uint8Array ? b64(a.content) : String(a.content),
          contentType: a.contentType || guessContentType(a.filename),
          disposition: a.disposition || 'attachment',
          contentId: a.contentId,
        };
      });
    }; // line 428 should be just };

    // Helper to convert attachments to Brevo format
    const toBrevoAttachments = (atts: EmailAttachment[]) => {
      return atts.map(a => {
        return {
          name: a.filename,
          content: a.content instanceof Uint8Array ? b64(a.content) : String(a.content),
          contentType: a.contentType || guessContentType(a.filename),
          disposition: a.disposition || 'attachment',
        };
      });
    };

    // Helper to convert attachments to Sender format (Sender doesn't officially support attachments in API)
    const toSenderAttachments = (atts: EmailAttachment[]) => {
      console.warn('Sender.net does not support attachments via transactional API; omitting');
      return [];
    };

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    const payload: Record<string, any> = {
      from: `${fromName} <${provider.fromEmail}>`,
      to: [toName ? `${toName} <${to}>` : to],
      reply_to: replyTo || provider.replyToEmail,
      subject,
      html,
      text,
    };

    if (hasAttachments) {
      payload.attachments = toResendAttachments(options.attachments!);
    }

    let response: Response;
    let providerMessageId: string | null = null;

    try {
      switch (provider.provider) {
        case 'resend': {
          const resendPayload: Record<string, any> = {
            from: `${fromName} <${provider.fromEmail}>`,
            to: [options.toName ? `${options.toName} <${options.to}>` : options.to],
            reply_to: replyTo || provider.replyToEmail,
            subject,
            html,
            text,
          };
          if (hasAttachments) {
            resendPayload.attachments = toResendAttachments(options.attachments!);
          }
          response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`,
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(resendPayload),
          });
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            providerMessageId = data.id || '';
          }
          break;
        }
        case 'brevo': {
          const brevoPayload: Record<string, any> = {
            sender: { name: fromName, email: provider.fromEmail },
            to: [{ email: options.to, name: toName }],
            replyTo: { email: replyTo || provider.replyToEmail },
            subject,
            htmlContent: html,
            textContent: text,
          };
          if (hasAttachments) {
            brevoPayload.attachment = options.attachments!.map(a => ({
              name: a.filename,
              content: a.content instanceof Uint8Array ? b64(a.content) : String(a.content),
              contentType: a.contentType || (a.filename.endsWith('.pdf') ? 'application/pdf' : 
                a.filename.match(/\.(png|jpg|jpeg|gif)$/i) ? `image/${a.filename.split('.').pop()}` : 'application/octet-stream'),
            }));
          }
          response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': provider.apiKey,
            },
            body: JSON.stringify(brevoPayload),
          });
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            providerMessageId = data.messageId || '';
          }
          break;
        }
        case 'sender': {
          // Sender.net transactional API spec: https://www.sender.net/help/transactional-emails/getting-started
          // Endpoint: POST https://api.sender.net/v2/message/send
          // Auth: Authorization: Bearer <token>
          // Accept: application/json
          // Content-Type: application/json
          // Required: from {email, name}, to {email, name?}, subject, html and/or text
          const senderPayload: Record<string, any> = {
            from: { email: provider.fromEmail, name: fromName },
            to: { email: options.to, name: toName || '' },
            subject,
            html,
            text,
          };
          // reply_to not in official spec; omit to avoid 422
          // Sender doesn't support attachments in transactional API
          if (hasAttachments) {
            console.warn('Sender.net does not support attachments via transactional API; omitting');
          }
          response = await fetch('https://api.sender.net/v2/message/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify(senderPayload),
          });
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            providerMessageId = data.emailId || data.id || data.message_id || data.messageId || '';
            // Capture rate limit headers for monitoring
            const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
            const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
            const rateLimitReset = response.headers.get('X-RateLimit-Reset');
            if (rateLimitLimit || rateLimitRemaining) {
              console.log(`Sender.net rate limit: limit=${rateLimitLimit}, remaining=${rateLimitRemaining}, reset=${rateLimitReset}`);
            }
          }
          break;
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        success: false,
        provider: provider.provider,
        providerMessageId: null,
        status: 'unknown',
        error: err,
        errorCategory: 'network_error',
        attempts: 0
      };
    }

    if (response.ok) {
      return {
        success: true,
        provider: provider.provider,
        providerMessageId,
        status: 'sent',
        attempts: 1
      };
    }

    // Parse error response
    const body = await response.text().catch(() => '');
    let errorName = '';
    try { errorName = JSON.parse(body)?.name || ''; } catch {}

    const status = response.status;
    let errorCategory: EmailDeliveryResult['errorCategory'] = 'unknown';
    let errorMsg = `HTTP ${status}: ${body.slice(0, 200)}`;

    if (status === 429 || (status === 400 && errorName?.includes('rate'))) {
      errorCategory = 'provider_rate_limit';
      errorMsg = `Rate limited: ${body.slice(0, 200)}`;
    } else if (status === 401 || status === 403 || errorName?.includes('auth') || errorName?.includes('unauthorized')) {
      errorCategory = 'provider_auth';
      errorMsg = `Authentication failed: ${body.slice(0, 200)}`;
    } else if (status === 402 || errorName?.includes('quota') || errorName?.includes('limit')) {
      errorCategory = 'provider_quota';
      errorMsg = `Quota exceeded: ${body.slice(0, 200)}`;
    } else if (status >= 500) {
      errorCategory = 'provider_server';
      errorMsg = `Provider server error: ${body.slice(0, 200)}`;
    }

    return {
      success: false,
      provider: provider.provider,
      providerMessageId: null,
      status: errorCategory === 'provider_rate_limit' ? 'unknown' : 'failed',
      error: new Error(errorMsg),
      errorCategory,
      attempts: 1
    };
  }

  private async reserveQuota(provider: string, count: number): Promise<boolean> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_reserve_quota`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ p_provider: provider, p_count: count })
    });
    const result = await response.json().catch(() => false);
    return result === true;
  }

  private async releaseQuota(provider: string, count: number): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_release_quota`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_provider: provider, p_count: count })
    });
  }

  private async recordProviderFailure(provider: string, category: string, retryAfter?: number): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_provider_failure`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_provider: provider, p_category: category, p_retry_after_seconds: retryAfter })
    });
  }

  private async recordProviderSuccess(provider: string): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_provider_success`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_provider: provider })
    });
  }

  private async getAvailableProviders(requiredCount: number): Promise<EmailProviderConfig[]> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_get_next_provider`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ p_required_count: requiredCount })
    });
    const results = await response.json().catch(() => []);
    
    return results.map((r: any) => ({
      provider: r.provider,
      apiKey: Deno.env.get(r.api_key_name) || '',
      fromEmail: r.from_email,
      fromName: r.from_name,
      replyToEmail: r.reply_to_email,
      domain: r.domain,
      dailyLimit: r.daily_limit || this.getDefaultDailyLimit(r.provider, 'free'),
      monthlyLimit: r.monthly_limit || this.getDefaultMonthlyLimit(r.provider, 'free'),
      rateLimitPerSec: r.rate_limit_per_sec || this.getDefaultRateLimit(r.provider),
      rateLimitPerMin: r.rate_limit_per_min || 60,
    })).filter(p => p.apiKey);
  }

  private async claimDelivery(idempotencyKey: string): Promise<boolean> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_claim_delivery`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ p_idempotency_key: idempotencyKey, p_claimed_by: this.workerId, p_ttl_seconds: 300 })
    });
    const result = await response.json().catch(() => false);
    return result === true;
  }

  private async releaseClaim(idempotencyKey: string): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/rpc/email_release_claim`, {
      method: 'POST',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_idempotency_key: idempotencyKey, p_claimed_by: this.workerId })
    });
  }

  private async updateDeliveryLog(idempotencyKey: string, patch: Record<string, unknown>): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/email_delivery_log?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
      method: 'PATCH',
      headers: { 
        apikey: this.supabaseKey, 
        Authorization: `Bearer ${this.supabaseKey}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    });
  }

  private async getDeliveryLog(idempotencyKey: string): Promise<any> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/email_delivery_log?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`, {
      headers: { apikey: this.supabaseKey, Authorization: `Bearer ${this.supabaseKey}` }
    });
    const data = await response.json().catch(() => []);
    return data[0] || null;
  }

  // ---- Email Command Center bookkeeping (best-effort; never throws) ---------

  private async isSuppressed(email: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/email_suppressions?email=eq.${encodeURIComponent(String(email || '').toLowerCase())}&select=reason&limit=1`,
        { headers: { apikey: this.supabaseKey, Authorization: `Bearer ${this.supabaseKey}` } }
      );
      if (!response.ok) return false;
      const data = await response.json().catch(() => []);
      return Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
  }

  private async captureRender(logId: string, options: EmailDeliveryOptions): Promise<void> {
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/email_renders?on_conflict=delivery_log_id`, {
        method: 'POST',
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{
          delivery_log_id: logId,
          idempotency_key: options.idempotencyKey,
          campaign_key: options.campaignKey || options.emailType,
          email_type: options.emailType,
          subject: options.subject,
          html: options.html,
          text_content: options.text
        }])
      });
    } catch {
      // never block a send on preview capture
    }
  }

  private async recordAttempt(
    logId: string | null,
    idempotencyKey: string,
    provider: string,
    attemptNumber: number,
    result: EmailDeliveryResult
  ): Promise<void> {
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/email_delivery_attempts`, {
        method: 'POST',
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify([{
          delivery_log_id: logId,
          idempotency_key: idempotencyKey,
          provider,
          attempt_number: attemptNumber,
          provider_message_id: result.providerMessageId,
          status: result.success ? 'accepted' : (result.status || 'failed'),
          error_category: result.errorCategory || null,
          error: result.error ? String((result.error as Error).message || result.error) : null
        }])
      });
    } catch {
      // attempts are diagnostic only
    }
  }
}

// Factory function for easy use in Edge Functions
export async function createEmailDelivery(workerId?: string): Promise<EmailDelivery> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const delivery = new EmailDelivery(url, key, workerId);
  await delivery.initialize();
  return delivery;
}