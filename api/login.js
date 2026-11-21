const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const API_ID = Number(process.env.API_ID) || 6;
const API_HASH = process.env.API_HASH || "eb06d4abfb49dc3eeb1aeb98ae0f581e";
const CLIENT_OPTS = {
  connectionRetries: 3,
  deviceModel: "Redmi Redmi A3",
  systemVersion: "SDK 34",
  appVersion: "11.5.0",
  langCode: "en",
  systemLangCode: "en-US",
};

const HTML = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TG Login</title>
<style>
  body{font-family:sans-serif;max-width:420px;margin:30px auto;padding:0 16px;background:#111;color:#fff}
  input,button,textarea{width:100%;box-sizing:border-box;padding:12px;margin:8px 0;font-size:16px;border-radius:8px;border:1px solid #333;background:#222;color:#fff}
  button{background:#2aabee;border:none;font-weight:bold;cursor:pointer}
  .hide{display:none}
  #log{color:#ff6b6b;margin:8px 0;word-break:break-word}
</style>
</head>
<body>
  <h3>Вход (US / Redmi Redmi A3)</h3>
  <div id="s1">
    <input id="phone" placeholder="+79991234567" type="tel">
    <button onclick="sendCode()">Отправить код</button>
  </div>
  <div id="s2" class="hide">
    <p id="hint"></p>
    <input id="code" placeholder="Код из Telegram" type="text">
    <button onclick="verify()">Войти</button>
  </div>
  <div id="s3" class="hide">
    <input id="pass" placeholder="Облачный пароль (2FA)" type="password">
    <button onclick="sendPass()">Подтвердить 2FA</button>
  </div>
  <div id="s4" class="hide">
    <p>Готово! Скопируй и вставь в SESSION_STRING на Vercel:</p>
    <textarea id="out" rows="6" readonly></textarea>
    <button onclick="copyOut()">Скопировать</button>
  </div>
  <div id="log"></div>
<script>
let tempSession="", phoneCodeHash="", phone="";
const $ = id => document.getElementById(id);
async function post(data) {
  $("log").style.color = "#aaa";
  $("log").textContent = "Загрузка...";
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { $("log").style.color = "#ff6b6b"; $("log").textContent = txt; return null; }
  if (!j.ok) { $("log").style.color = "#ff6b6b"; $("log").textContent = "Ошибка: " + (j.error || "unknown"); return null; }
  $("log").textContent = "";
  return j;
}
async function sendCode() {
  phone = $("phone").value.trim();
  const j = await post({ action: "send", phone });
  if (!j) return;
  tempSession = j.tempSession;
  phoneCodeHash = j.phoneCodeHash;
  $("hint").textContent = j.viaApp ? "Код отправлен в приложение Telegram" : "Код отправлен (не в приложение)";
  $("s1").classList.add("hide");
  $("s2").classList.remove("hide");
}
async function verify() {
  const code = $("code").value.trim();
  const j = await post({ action: "verify", phone, code, phoneCodeHash, tempSession });
  if (!j) return;
  if (j.needPassword) {
    tempSession = j.tempSession;
    $("s2").classList.add("hide");
    $("s3").classList.remove("hide");
    return;
  }
  showDone(j.session);
}
async function sendPass() {
  const password = $("pass").value;
  const j = await post({ action: "password", password, tempSession });
  if (!j) return;
  showDone(j.session);
}
function showDone(s) {
  $("s2").classList.add("hide");
  $("s3").classList.add("hide");
  $("s4").classList.remove("hide");
  $("out").value = s;
}
function copyOut() {
  $("out").select();
  navigator.clipboard.writeText($("out").value);
  $("log").style.color = "#4cd964";
  $("log").textContent = "Скопировано!";
}
</script>
</body>
</html>`;

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(HTML);
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const client = new TelegramClient(
    new StringSession(body.tempSession || ""),
    API_ID,
    API_HASH,
    CLIENT_OPTS
  );
  client.setLogLevel("none");

  try {
    await client.connect();

    if (body.action === "send") {
      const r = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, String(body.phone || "").trim());
      return res.status(200).json({
        ok: true,
        tempSession: client.session.save(),
        phoneCodeHash: r.phoneCodeHash,
        viaApp: Boolean(r.isCodeViaApp),
      });
    }

    if (body.action === "verify") {
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: String(body.phone || "").trim(),
            phoneCodeHash: String(body.phoneCodeHash || ""),
            phoneCode: String(body.code || "").trim(),
          })
        );
      } catch (e) {
        if (e.errorMessage === "SESSION_PASSWORD_NEEDED") {
          return res.status(200).json({
            ok: true,
            needPassword: true,
            tempSession: client.session.save(),
          });
        }
        throw e;
      }
      return res.status(200).json({ ok: true, session: client.session.save() });
    }

    if (body.action === "password") {
      await client.signInWithPassword(
        { apiId: API_ID, apiHash: API_HASH },
        {
          password: async () => String(body.password || ""),
          onError: (err) => { throw err; },
        }
      );
      return res.status(200).json({ ok: true, session: client.session.save() });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.errorMessage || err.message });
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
  }
};
