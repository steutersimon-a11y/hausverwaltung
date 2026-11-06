"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const DEMO_EMAIL = "admin@atlas.example";
const DEMO_PASSWORD = "Atlas-Demo-2026!";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setError("Zu viele Anmeldeversuche. Bitte warte kurz und versuche es erneut.");
        } else if (response.status === 401 || response.status === 400) {
          setError("E-Mail-Adresse oder Passwort stimmen nicht. Bitte prüfe deine Eingaben.");
        } else {
          setError("Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut.");
        }
        return;
      }

      router.push("/portfolio");
      router.refresh();
    } catch {
      setError("Der Server ist nicht erreichbar. Bitte prüfe, ob die lokale Anwendung gestartet ist.");
    } finally {
      setPending(false);
    }
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
    document.getElementById("login-email")?.focus();
  }

  return (
    <main className="login-page">
      <div className="login-grid" aria-hidden="true" />

      <header className="login-header">
        <a href="/login" className="login-brand" aria-label="ATLAS Property OS, Anmeldung">
          <svg viewBox="0 0 36 38" fill="none" aria-hidden="true">
            <path d="m18 3 14 8v16l-14 8L4 27V11l14-8Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="m4 11 14 8 14-8M18 19v16M11 7v16l14 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>ATLAS<small>PROPERTY OS</small></span>
        </a>
        <span className="login-demo-badge"><span /> Lokale Demo</span>
      </header>

      <div className="login-main">
        <section className="login-intro" aria-labelledby="intro-title">
          <p className="login-eyebrow">RAUM FÜR KLARE ENTSCHEIDUNGEN</p>
          <h1 id="intro-title">Immobilien verstehen.<br /><em>Zusammenhänge sehen.</em></h1>
          <p className="login-description">Gebäude, Einheiten und Vorgänge an einem Ort. Eine räumliche Perspektive auf die tägliche Verwaltung.</p>

          <div className="login-model" aria-hidden="true">
            <div className="model-ground" />
            <div className="model-building building-one"><i /><i /><i /><i /><i /><i /></div>
            <div className="model-building building-two"><i /><i /><i /><i /></div>
            <div className="model-building building-three"><i /><i /><i /><i /><i /><i /></div>
            <span className="model-point point-one" />
            <span className="model-point point-two" />
            <span className="model-axis">N</span>
            <span className="model-label">MODELLSKIZZE · FIKTIV</span>
          </div>

          <div className="login-intro-footer"><span className="intro-line" /> Für den Überblick. Für die Details.</div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-topline"><span className="login-step">01 / ZUGANG</span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M7 8V6a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.3" /></svg></div>
          <h2 id="login-title">Willkommen bei ATLAS.</h2>
          <p className="login-subtitle">Melde dich an, um deinen Arbeitsbereich zu öffnen.</p>

          <form onSubmit={signIn} className="login-form" aria-describedby={error ? "login-error" : undefined}>
            <div className="login-field">
              <label htmlFor="login-email">E-Mail-Adresse</label>
              <input id="login-email" name="email" type="email" autoComplete="username" placeholder="name@verwaltung.de" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} disabled={pending} />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Passwort</label>
              <div className="login-password-wrap">
                <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Dein Passwort" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} disabled={pending} />
                <button type="button" className="login-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} aria-pressed={showPassword} disabled={pending}>
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2 10s2.7-5 8-5 8 5 8 5-2.7 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.3" /><circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.3" />{showPassword ? <path d="m3 3 14 14" stroke="currentColor" strokeWidth="1.3" /> : null}</svg>
                </button>
              </div>
            </div>

            {error ? <p className="login-error" id="login-error" role="alert">{error}</p> : null}

            <button type="submit" className="login-submit" disabled={pending}>
              {pending ? <><span className="login-spinner" aria-hidden="true" /> Anmeldung läuft …</> : <>Arbeitsbereich öffnen <span aria-hidden="true">↗</span></>}
            </button>
          </form>

          <div className="login-demo-box">
            <div className="login-demo-icon" aria-hidden="true">D</div>
            <div><strong>Erst einmal kennenlernen.</strong><p>Ausschließlich fiktive Testdaten.</p></div>
            <button type="button" onClick={fillDemo} disabled={pending}>Demo-Zugang einsetzen <span aria-hidden="true">→</span></button>
          </div>
          <p className="login-local-note">Dieser Prototyp ist für die lokale Erprobung vorgesehen. Es werden keine echten Bank- oder Aareon-Verbindungen hergestellt.</p>
        </section>
      </div>

      <footer className="login-footer"><span>ATLAS PROPERTY OS</span><span>Prototyp · Synthetischer Demobestand</span></footer>

      <style jsx>{`
        .login-page{--lp-bg:#101a24;--lp-panel:#18232f;--lp-text:#edf3f1;--lp-muted:#a6b5be;--lp-line:#2c3b48;--lp-accent:#92c5b2;position:relative;min-height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--lp-bg);color:var(--lp-text);font-family:Inter,"Avenir Next",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .login-grid{position:absolute;inset:0;opacity:.18;pointer-events:none;background-image:linear-gradient(#4f6472 1px,transparent 1px),linear-gradient(90deg,#4f6472 1px,transparent 1px);background-size:84px 84px;mask-image:linear-gradient(to right,#000,transparent 60%)}
        .login-header,.login-footer{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;padding:37px 5.2vw}
        .login-brand{display:flex;gap:13px;align-items:center;text-decoration:none;color:var(--lp-text)}.login-brand svg{width:35px;height:38px;color:var(--lp-accent)}.login-brand>span{font-size:23px;font-weight:650;letter-spacing:5px;line-height:1}.login-brand small{display:block;letter-spacing:3.05px;font-size:8px;font-weight:500;color:var(--lp-muted);margin-top:8px}
        .login-demo-badge{display:flex;align-items:center;gap:8px;border:1px solid var(--lp-line);border-radius:40px;padding:8px 12px;font-size:11px;letter-spacing:.2px;color:#c5d4d8;background:#15202a}.login-demo-badge>span{width:5px;height:5px;background:var(--lp-accent);border-radius:50%}
        .login-main{position:relative;z-index:1;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 425px;align-items:center;gap:7vw;width:min(1210px,89.6vw);margin:25px auto 42px}
        .login-intro{min-width:0;align-self:stretch;display:flex;flex-direction:column;justify-content:center;padding:15px 0 0}.login-eyebrow{font-size:10px;letter-spacing:2px;color:#91adab;font-weight:600;margin:0 0 24px}.login-intro h1{font-weight:450;letter-spacing:-2px;font-size:clamp(30px,3.15vw,49px);line-height:1.18;margin:0;color:#f0f2ec}.login-intro h1 em{font-style:normal;color:#a7caba}.login-description{max-width:425px;font-size:14px;line-height:1.9;color:var(--lp-muted);margin:24px 0 0}.login-intro-footer{font-size:11px;letter-spacing:.2px;color:#8c9ea6;display:flex;align-items:center;gap:12px;margin-top:15px}.intro-line{height:1px;width:29px;background:#7a9d8e}
        .login-model{height:260px;position:relative;width:min(500px,100%);margin-top:14px;perspective:900px}.model-ground{position:absolute;width:365px;height:160px;left:40px;top:70px;background:repeating-linear-gradient(0deg,transparent,transparent 31px,#6c8c7d32 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,#6c8c7d32 32px);transform:rotateX(55deg) rotateZ(-23deg);border:1px solid #6b8b7a38}
        .model-building{position:absolute;display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:17px;background:#466559;border:1px solid #82978b;transform:skewY(-17deg);box-shadow:15px 17px 0 #0c151b44}.model-building:before{content:"";position:absolute;left:-1px;right:0;top:-23px;height:22px;background:#829485;transform:skewX(55deg);transform-origin:bottom;border:1px solid #9fae9e}.model-building:after{content:"";position:absolute;top:-1px;bottom:-1px;right:-31px;width:30px;background:#2b423c;transform:skewY(35deg);transform-origin:left;border:1px solid #60786b}.model-building i{display:block;width:14px;height:18px;background:#aabdab73;border:1px solid #abc0ae9c}.building-one{width:104px;height:143px;left:98px;top:71px;z-index:3}.building-two{width:90px;height:107px;left:218px;top:99px;z-index:2;background:#3f5b52}.building-three{width:94px;height:140px;left:308px;top:37px;z-index:1;background:#324d46}.model-point{position:absolute;width:8px;height:8px;background:#c9b99a;border:2px solid #14212a;border-radius:50%;box-shadow:0 0 0 5px #bcae8e17}.point-one{left:57px;top:158px}.point-two{left:362px;top:205px}.model-axis{position:absolute;left:32px;bottom:15px;color:#718a80;font-size:9px}.model-axis:before{content:"↑";display:block;font-size:21px;line-height:1.1;text-align:center}.model-label{position:absolute;right:4px;bottom:12px;font-size:8px;letter-spacing:1.5px;color:#6f8482}
        .login-card{background:var(--lp-panel);border:1px solid #34414b;border-radius:14px;padding:33px 34px 25px;box-shadow:0 20px 60px #050c121f}.login-card-topline{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}.login-step{font-size:9px;letter-spacing:1.6px;color:#94aea5}.login-card-topline>svg{width:19px;height:19px;color:#8daca2}.login-card h2{font-size:25px;letter-spacing:-.9px;font-weight:550;margin:0 0 12px;line-height:1.25}.login-subtitle{font-size:12px;color:var(--lp-muted);line-height:1.8;margin:0 0 28px}
        .login-form{display:grid;gap:20px}.login-field label{display:block;font-size:11px;letter-spacing:.1px;color:#c7d0d5;margin:0 0 9px}.login-field input{display:block;box-sizing:border-box;height:46px;width:100%;border:1px solid #3d4b57;background:#121e29;border-radius:6px;padding:0 13px;font:inherit;font-size:13px;color:#edf3f1;transition:border-color .15s}.login-field input::placeholder{color:#758b9b}.login-field input:focus{border-color:#a2c9b6;outline:2px solid #a2c9b62b;outline-offset:2px}.login-password-wrap{position:relative}.login-password-wrap input{padding-right:48px}.login-password-toggle{position:absolute;right:5px;top:5px;display:grid;place-items:center;width:36px;height:36px;border:0;background:none;color:#8c9fa7;cursor:pointer;border-radius:3px}.login-password-toggle svg{height:19px;width:19px}.login-password-toggle:hover{color:#dbebe3;background:#233441}.login-submit{height:46px;display:flex;align-items:center;justify-content:center;gap:10px;background:#a6cdb7;color:#142b25;border:1px solid #b4d6c3;border-radius:6px;font:inherit;font-size:12px;font-weight:650;cursor:pointer;margin-top:4px;transition:background .15s}.login-submit>span:last-child{font-size:19px;margin-left:auto}.login-submit>span:first-child:last-child{margin-left:0}.login-submit:not(:disabled){padding:0 17px}.login-submit:hover:not(:disabled){background:#bcddc9}.login-submit:disabled,.login-field input:disabled,.login-password-toggle:disabled{opacity:.65;cursor:wait}.login-error{font-size:12px;line-height:1.6;margin:0;border:1px solid #b6796c;border-radius:5px;padding:10px 12px;color:#f0c7bb;background:#472b2a}
        .login-demo-box{display:grid;grid-template-columns:30px 1fr;column-gap:11px;align-items:center;padding:19px 0;margin-top:23px;border-top:1px solid #34434c;border-bottom:1px solid #34434c}.login-demo-icon{border:1px solid #677c70;color:#b2c6b6;width:28px;height:30px;border-radius:5px;display:grid;place-items:center;font-size:11px;font-family:Georgia,serif}.login-demo-box strong{display:block;font-size:11px;font-weight:500;color:#c9d9cf}.login-demo-box p{font-size:10px;color:#92a6a8;line-height:1.5;margin:5px 0 0}.login-demo-box button{grid-column:2;text-align:left;border:0;padding:0;margin-top:13px;background:none;color:#aaceb8;cursor:pointer;font:inherit;font-size:11px;display:flex;gap:8px;align-items:center;width:max-content}.login-demo-box button:hover{text-decoration:underline}.login-demo-box button:disabled{opacity:.6;cursor:wait}.login-local-note{font-size:10px;line-height:1.8;color:#8b9da6;margin:17px 0 0}.login-footer{padding-top:18px;padding-bottom:26px;font-size:9px;letter-spacing:1.8px;color:#728995;gap:15px}.login-footer>span:last-child{letter-spacing:.3px;font-size:10px}
        .login-page button:focus-visible,.login-page a:focus-visible{outline:2px solid #afccb9;outline-offset:4px}.login-spinner{height:13px;width:13px;border-radius:50%;border:2px solid #365c4a4d;border-top-color:#193c2b;animation:login-spin .7s linear infinite}@keyframes login-spin{to{transform:rotate(360deg)}}
        @media(min-width:1600px){.login-main{gap:120px}.login-card{padding:39px 39px 29px}}
        @media(max-width:1050px){.login-main{grid-template-columns:minmax(0,1fr) 385px;gap:5vw}.login-intro h1{font-size:34px}.login-model{transform:scale(.83);transform-origin:left center;margin-top:0;height:230px}.login-card{padding:28px}.login-description{font-size:13px}.login-intro-footer{font-size:10px}}
        @media(max-width:780px){.login-header{padding:25px 25px}.login-main{display:flex;flex-direction:column;gap:32px;width:min(440px,calc(100% - 38px));margin:17px auto 34px}.login-intro{align-self:auto;width:100%;padding:0}.login-eyebrow{font-size:8px;margin-bottom:14px;letter-spacing:1.5px}.login-intro h1{font-size:31px;letter-spacing:-1.2px}.login-description{font-size:12px;line-height:1.8;margin-top:16px;max-width:390px}.login-model,.login-intro-footer{display:none}.login-card{width:100%;box-sizing:border-box;padding:26px}.login-card-topline{margin-bottom:21px}.login-card h2{font-size:24px}.login-subtitle{margin-bottom:23px}.login-footer{padding:10px 23px 23px;line-height:1.7;font-size:8px;letter-spacing:1.1px}.login-footer>span:last-child{font-size:9px}.login-demo-badge{font-size:10px;padding:7px 10px}.login-brand>span{font-size:19px}.login-brand small{font-size:7px;letter-spacing:2.6px}.login-brand svg{width:29px;height:32px}}
        @media(prefers-reduced-motion:reduce){.login-spinner{animation:none}.login-field input,.login-submit{transition:none}}
      `}</style>
    </main>
  );
}
