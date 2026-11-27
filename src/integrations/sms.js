/**
 * SMS via MSG91 (HLD: fallback OTP channel — it's the costliest line at
 * scale, so prefer Google sign-in / email OTP first). Logs when unset.
 */
const env = require('../config/env');
const logger = require('../infra/logger');

async function sendOtpSms(phone, otp) {
  if (!env.features.sms) {
    logger.info('[sms:dev] OTP', { phone, otp });
    return { mock: true };
  }
  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: env.sms.msg91AuthKey },
    body: JSON.stringify({
      template_id: env.sms.msg91OtpTemplateId,
      mobile: phone.replace(/[^\d]/g, ''),
      otp,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
  return res.json();
}

module.exports = { sendOtpSms };
