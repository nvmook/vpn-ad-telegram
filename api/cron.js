const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const API_ID = 2040;
const API_HASH = "b18441a1ff607e10a989891a5462e627";

const PHRASES = [
  "😈 B𐌿H\n\n🌐B П𝘖ИСK в Теⲗⲗⲉгее :   сlеаrа𐌿се_vр𐌿\n\n🌐B П𝘖ИСK в Теⲗⲗⲉгее :   сlеаrа𐌿се_vр𐌿\n\n🌐B П𝘖ИСK в Теⲗⲗⲉгее :   сlеаrа𐌿се_vр𐌿"
];

const randName = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const len = 4 + Math.floor(Math.random() * 5);
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const dedupAlbums = (list) => {
  const out = [];
  const seen = new Set();
  for (const m of [...list].sort((a, b) => a.id - b.id)) {
    if (m.groupedId) {
      const gid = String(m.groupedId);
      if (seen.has(gid)) continue;
      seen.add(gid);
    }
    out.push(m);
  }
  return out;
};

module.exports = async (req, res) => {
  const target = (process.env.TARGET_CHAT || "").replace("@", "").trim().toLowerCase();
  const session = (process.env.SESSION_STRING || "").trim();

  if (!target || !session) {
    return res.status(500).send("Missing TARGET_CHAT or SESSION_STRING");
  }

  const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, {
    connectionRetries: 2,
    deviceModel: "Desktop",
    systemVersion: "Windows 10",
    appVersion: "4.16.8 x64",
  });
  client.setLogLevel("error");

  let result = "OK: no new posts";

  try {
    await client.connect();

    const entity = await client.getEntity(target);
    const me = await client.getMe();
    const myId = String(me.id);
    const now = Math.floor(Date.now() / 1000);
    const isChannel = Boolean(entity.broadcast);

    const msgs = await client.getMessages(entity, { limit: isChannel ? 10 : 20 });

    const recent = isChannel
      ? msgs.filter((m) => m && m.replies && m.replies.comments && now - m.date <= 180)
      : msgs.filter((m) => m && m.fwdFrom && m.fwdFrom.channelPost && now - m.date <= 180);

    for (const post of dedupAlbums(recent)) {
      let alreadyCommented = false;

      if (isChannel) {
        if (post.replies.replies > 0) {
          const replies = await client
            .getMessages(entity, { replyTo: post.id, limit: 30 })
            .catch(() => []);
          alreadyCommented = replies.some(
            (r) => r.out || String(r.fromId?.userId) === myId
          );
        }
      } else {
        alreadyCommented = msgs.some(
          (r) =>
            (r.out || String(r.fromId?.userId) === myId) &&
            (r.replyTo?.replyToMsgId === post.id || r.replyTo?.replyToTopId === post.id)
        );
      }

      if (alreadyCommented) continue;

      await client
        .invoke(new Api.account.UpdateProfile({ firstName: randName(), lastName: "" }))
        .catch(() => {});

      const text = PHRASES[Math.floor(Math.random() * PHRASES.length)];

      const sent = await client.sendMessage(
        entity,
        isChannel
          ? { message: text, commentTo: post.id }
          : { message: text, replyTo: post.id }
      );

      await new Promise((r) => setTimeout(r, 3000));

      await client.editMessage(isChannel ? sent.peerId : entity, {
        message: sent.id,
        text: `${text}\nохх.`,
      });

      result = `OK: commented on post ${post.id}`;
      break;
    }
  } catch (err) {
    console.error("Cron error:", err);
    result = `ERROR: ${err.message}`;
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
  }

  return res.status(200).send(result);
};
