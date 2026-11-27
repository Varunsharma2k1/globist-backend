/**
 * Notifications (HLD notifier). Other modules call `notify(userId, msg)`;
 * delivery happens on the NOTIFY queue so a slow FCM/SMS/SES call never
 * blocks a request. Channels: push always; sms/email when asked.
 */
const User = require('../users/user.model');
const { enqueue, QUEUES } = require('../../infra/queue');
const { sendPush } = require('../../integrations/push');
const { sendOtpSms } = require('../../integrations/sms');
const { sendEmail } = require('../../integrations/email');

/** msg: { title, body, data?, email?: { subject, text, html }, smsOtp?: string } */
function notify(userId, msg) {
  return enqueue(QUEUES.NOTIFY, 'notify', { userId: String(userId), ...msg });
}

/** Queue processor (run by the worker, or inline without Redis). */
async function processNotifyJob({ data }) {
  const user = await User.findById(data.userId).select('deviceTokens email phone');
  if (!user) return;
  const tokens = (user.deviceTokens || []).map((d) => d.token);
  if (data.title && tokens.length) {
    const { invalidTokens } = await sendPush(tokens, { title: data.title, body: data.body, data: data.data || {} });
    if (invalidTokens.length) {
      await User.updateOne({ _id: user._id }, { $pull: { deviceTokens: { token: { $in: invalidTokens } } } });
    }
  }
  if (data.email && user.email) await sendEmail({ to: user.email, ...data.email });
  if (data.smsOtp && user.phone) await sendOtpSms(user.phone, data.smsOtp);
}

async function registerDevice(userId, { token, platform = 'android' }) {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
  await User.updateOne(
    { _id: userId },
    { $push: { deviceTokens: { $each: [{ token, platform, updatedAt: new Date() }], $slice: -10 } } }
  );
}

const unregisterDevice = (userId, token) => User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });

module.exports = { notify, processNotifyJob, registerDevice, unregisterDevice };
