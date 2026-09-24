// Kleine Helfer für die Oberfläche.
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uid = (p) => (p || "id") + Math.random().toString(36).slice(2, 9);
function toast(msg, isError) {
  const t = el('<div class="toast">' + esc(msg) + "</div>");
  if (isError) t.classList.add("error");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isError ? 5000 : 3000);
}
function debounce(fn, ms) { let h = null; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

// Fenster: dialog({ title, body (Text/HTML oder Element), actions: [{ label, kind: "" | "secondary" | "danger", onClick(close) }] })
function dialog(opts) {
  const overlay = el('<div class="overlay"></div>');
  const box = el('<div class="dialog" role="dialog"></div>');
  if (opts.title) box.appendChild(el("<h2>" + esc(opts.title) + "</h2>"));
  const body = el('<div class="dialog-body"></div>');
  if (opts.body instanceof Node) body.appendChild(opts.body); else body.innerHTML = opts.body || "";
  box.appendChild(body);
  const actions = el('<div class="actions"></div>');
  const close = () => overlay.remove();
  (opts.actions || [{ label: "OK" }]).forEach((a) => {
    const b = el('<button class="btn ' + (a.kind || "") + '">' + esc(a.label) + "</button>");
    b.addEventListener("click", () => { if (a.onClick) { const keep = a.onClick(close, box); if (keep === false) return; } close(); });
    actions.appendChild(b);
  });
  box.appendChild(actions);
  overlay.appendChild(box);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay && !opts.modal) close(); });
  document.body.appendChild(overlay);
  return { close, box, overlay };
}
function confirmDialog(title, text, okLabel, danger) {
  return new Promise((resolve) => {
    dialog({ title, body: '<p class="help" style="font-size:13px;color:var(--text-dim)">' + esc(text) + "</p>", modal: true, actions: [
      { label: "Abbrechen", kind: "secondary", onClick: () => resolve(false) },
      { label: okLabel || "OK", kind: danger ? "danger" : "", onClick: () => resolve(true) }] });
  });
}
