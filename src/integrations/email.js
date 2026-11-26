/** Transactional email via Amazon SES (receipts, email OTP). Logs when unset. */
const env = require('../config/env');
const logger = require('../infra/logger');

let ses = null;
function getSes() {
  if (!env.features.email) return null;
  if (!ses) {
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
    ses = new SESv2Client({
      region: env.email.sesRegion,
      credentials: { accessKeyId: env.email.accessKeyId, secretAccessKey: env.email.secretAccessKey },
    });
  }
  return ses;
}

async function sendEmail({ to, subject, text, html }) {
  const client = getSes();
  if (!client) {
    logger.info('[email:dev]', { to, subject });
    return { mock: true };
  }
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  return client.send(
    new SendEmailCommand({
      FromEmailAddress: env.email.from,
      Destination: { ToAddresses: [].concat(to) },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { ...(text ? { Text: { Data: text } } : {}), ...(html ? { Html: { Data: html } } : {}) },
        },
      },
    })
  );
}

module.exports = { sendEmail };
