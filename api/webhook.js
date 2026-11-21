const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const API_ID = 2040;
const API_HASH = "b18441a1ff607e10a989891a5462e627";

const PHRASES = [
  "тест."
];

const seenAlbums = new Set();

const randName = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const len = 4 + Math.floor(Math.random() * 5);
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("OK");

  const msg = req.body?.message;
  const target = (process.env.TARGET_CHAT || "").replace("@", "").trim().toLowerCase();

  // Ловим только авто-пересылку нового поста канала в чат обсуждений
  if (!msg?.is_automatic_forward || msg.chat?.username?.toLowerCase() !== target) {
    return res.status(200).send("Ignored");
  }

  // Защита от дублей, если в посте альбом из нескольких фото
  if (msg.media_group_id) {
    if (seenAlbums.has(msg.media_group_id)) return res.status(200).send("Album duplicate");
    seenAlbums.add(msg.media_group_id);
    if (seenAlbums.size > 50) seenAlbums.clear();
  }

  const client = new TelegramClient(
    new StringSession(process.env.SESSION_STRING),
    API_ID,
    API_HASH,
    {
      connectionRetries: 2,
      deviceModel: "Desktop",
      systemVersion: "Windows 10",
      appVersion: "4.16.8 x64",
    }
  );
  client.setLogLevel("error");

  try {
    await client.connect();

    // Меняем имя на рандомное (если TG временно ограничил смену — пропускаем)
    await client
      .invoke(new Api.account.UpdateProfile({ firstName: randName(), lastName: "" }))
      .catch(() => {});

    const entity = await client.getEntity(target);
    const text = PHRASES[Math.floor(Math.random() * PHRASES.length)];

    const sent = await client.sendMessage(entity, {
      message: text,
      replyTo: msg.message_id,
    });

    await new Promise((r) => setTimeout(r, 3000));

    await client.editMessage(entity, {
      message: sent.id,
      text: `${text}\nохх.`,
    });
  } catch (err) {
    console.error("Webhook error:", err);
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
  }

  return res.status(200).send("Done");
};

