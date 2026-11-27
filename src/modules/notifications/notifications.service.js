/**
 * Notifications (HLD notifier). Other modules call `notify(userId, msg)`;
 * delivery happens on the NOTIFY queue so a slow FCM/SMS/SES call never
 * blocks a request. Channels: push always; sms/email when asked.
 */
const User = require('../users/user.model');
const Notification = require('./notification.model');
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

const PUSH_TEXT = {
  like: (name) => `${name} liked your tape`,
  comment: (name, text) => `${name} commented: ${text}`,
  follow: (name) => `${name} started following you`,
  booking: (_name, text) => `Your trip is booked: ${text}`,
};

/**
 * Records an in-app notification and sends a push. Never notifies you about
 * your own actions. Likes/follows are de-duplicated (liking, unliking and
 * liking again doesn't spam the owner).
 */
async function record({ user, actor, type, reel, text = '' }) {
  if (!user || (actor && String(actor) === String(user))) return;
  const doc = { user, actor, type, reel, text: String(text).slice(0, 200) };
  if (type === 'like' || type === 'follow') {
    const res = await Notification.updateOne(
      { user, actor, type, ...(reel ? { reel } : {}) },
      { $setOnInsert: doc },
      { upsert: true }
    );
    if (!res.upsertedCount) return; // already notified before
  } else {
    await Notification.create(doc);
  }
  const who = actor ? (await User.findById(actor).select('name').lean())?.name || 'Someone' : 'TripTape';
  notify(user, {
    title: 'TripTape',
    body: PUSH_TEXT[type](who, text),
    data: { type, reel: reel ? String(reel) : '' },
  }).catch(() => {});
}

/** Fire-and-forget wrapper so a notification problem never breaks the action. */
function recordSafe(n) {
  record(n).catch(() => {});
}

async function list(userId, { limit = 50 } = {}) {
  return Notification.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .populate('actor', 'name avatar')
    .populate('reel', 'thumbnailUrl location')
    .lean();
}

const unreadCount = (userId) => Notification.countDocuments({ user: userId, read: false });
const markAllRead = (userId) => Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });

module.exports = {
  notify,
  processNotifyJob,
  registerDevice,
  unregisterDevice,
  record: recordSafe,
  list,
  unreadCount,
  markAllRead,
};
