import "../../styles/splash.css";

export interface OverlayElements {
  root: HTMLDivElement;
  input: HTMLInputElement;
  generateBtn: HTMLButtonElement;
  defaultBtn: HTMLButtonElement;
  status: HTMLDivElement;
  info: HTMLDivElement;
}

export function createOverlay(): OverlayElements {
  const root = document.createElement("div");
  root.className = "splash-overlay";

  const stack = document.createElement("div");
  stack.className = "splash-stack";
  stack.setAttribute("role", "dialog");
  stack.setAttribute("aria-labelledby", "splash-title");

  const header = document.createElement("header");
  header.className = "splash-header";

  const h1 = document.createElement("h1");
  h1.id = "splash-title";
  h1.className = "splash-title";
  h1.textContent = "AI SPACESHIP";

  const p = document.createElement("p");
  p.className = "splash-sub";
  p.append(document.createTextNode("Generate your unique ship with a prompt"));
  p.appendChild(document.createElement("br"));
  const spanAlt = document.createElement("span");
  spanAlt.className = "splash-sub-alt";
  spanAlt.textContent = "and fly around with others in realtime";
  p.appendChild(spanAlt);

  const starWrap = document.createElement("div");
  starWrap.className = "gh-star-wrap";
  const gh = document.createElement("a");
  gh.className = "github-button";
  gh.href = "https://github.com/BenLirio/space-ship-generator";
  gh.setAttribute(
    "data-color-scheme",
    "no-preference: light; light: light; dark: dark;"
  );
  gh.setAttribute("data-icon", "octicon-star");
  gh.setAttribute("data-size", "large");
  gh.setAttribute("data-show-count", "true");
  gh.setAttribute("aria-label", "Star BenLirio/space-ship-generator on GitHub");
  gh.textContent = "Star";

  const discord = document.createElement("a");
  discord.className = "discord-link";
  discord.href = "https://discord.com/invite/F69uzFtgpT";
  discord.target = "_blank";
  discord.rel = "noopener";
  discord.setAttribute("aria-label", "Join our Discord (opens in new tab)");
  discord.textContent = "Join our Discord";

  const banana = document.createElement("a");
  banana.className = "banana-link";
  banana.href =
    "https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/";
  banana.target = "_blank";
  banana.rel = "noopener";
  banana.setAttribute("aria-label", "Model info (opens in new tab)");
  banana.textContent = "🍌 uses nano banana";

  starWrap.append(gh, discord, banana);
  header.append(h1, p, starWrap);

  const form = document.createElement("form");
  form.className = "splash-form";
  form.autocomplete = "off";

  const label = document.createElement("label");
  label.className = "visually-hidden";
  label.htmlFor = "shipPrompt";
  label.textContent = "Ship prompt";

  const input = document.createElement("input");
  input.id = "shipPrompt";
  input.name = "shipPrompt";
  input.type = "text";
  input.setAttribute("inputmode", "text");
  input.placeholder = "e.g. Sleek explorer with blue thrusters";

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const generate = document.createElement("button");
  generate.type = "submit";
  generate.className = "primary";
  generate.setAttribute("data-action", "generate");
  generate.textContent = "Generate Ship";

  const startDefault = document.createElement("button");
  startDefault.type = "button";
  startDefault.className = "secondary";
  startDefault.setAttribute("data-action", "default");
  startDefault.textContent = "Start with Default";

  btnRow.append(generate, startDefault);

  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("aria-live", "polite");

  const info = document.createElement("div");
  info.className = "info-log";
  info.setAttribute("aria-live", "polite");
  info.setAttribute("aria-atomic", "false");

  form.append(label, input, btnRow, status, info);
  stack.append(header, form);
  root.appendChild(stack);
  document.body.appendChild(root);

  // Load GH buttons once
  if (!document.getElementById("gh-buttons-script")) {
    const s = document.createElement("script");
    s.id = "gh-buttons-script";
    s.async = true;
    s.defer = true;
    s.src = "https://buttons.github.io/buttons.js";
    document.head.appendChild(s);
  } else {
    try {
      (window as any).GitHubButton?.renderAll?.();
    } catch {}
  }

  // Stop key events leaking to Phaser while typing
  input.addEventListener("keydown", (e) => e.stopPropagation());
  setTimeout(() => input.focus(), 80);

  return {
    root,
    input,
    generateBtn: generate,
    defaultBtn: startDefault,
    status: status as HTMLDivElement,
    info: info as HTMLDivElement,
  };
}
