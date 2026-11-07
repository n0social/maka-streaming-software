/**
 * Studio shell — layout init and overflow containment.
 * Boots program preview via initPreview(root); other modules own their hooks.
 */

import { initPreview } from "./preview.js";

const NARROW_MQ = "(max-width: 960px)";

function resolvePreviewRoot(root) {
  return (
    root.querySelector("#studio-preview") ||
    root.querySelector("#program") ||
    root.querySelector(".program") ||
    root.querySelector(".program-frame") ||
    null
  );
}

/**
 * Lock the studio grid so the center column cannot expand the page.
 * Uses minmax(0, 1fr) + overflow hidden on .app / .stage / .program-column.
 */
export function initShell(root = document) {
  const app =
    root.querySelector(".app") ||
    root.getElementById("studio-app") ||
    root.querySelector(".stream-app") ||
    document.body;

  const body = document.body;
  body.classList.add("stream-studio");
  if (!body.dataset.mode) body.dataset.mode = "studio";

  const stage =
    (app && app.querySelector && app.querySelector(".stage")) ||
    (app && app.querySelector && app.querySelector(".stream-stage-wrap")) ||
    null;
  const programColumn = app && app.querySelector ? app.querySelector(".program-column") : null;
  const program = resolvePreviewRoot(root) || resolvePreviewRoot(app || document);

  const lockOverflow = () => {
    const narrow = window.matchMedia(NARROW_MQ).matches;
    if (app && app.style) {
      app.style.minWidth = "0";
      app.style.minHeight = "0";
    }

    if (!narrow) {
      if (app && app.style) app.style.overflow = "hidden";
      if (stage) {
        stage.style.minWidth = "0";
        stage.style.minHeight = "0";
        stage.style.overflow = "hidden";
      }
      if (programColumn) {
        programColumn.style.minWidth = "0";
        programColumn.style.minHeight = "0";
        programColumn.style.overflow = "hidden";
      }
      if (program) {
        program.style.minWidth = "0";
        program.style.minHeight = "0";
        program.style.overflow = "hidden";
      }
      body.style.overflow = "hidden";
    } else {
      if (app && app.style) app.style.overflow = "";
      body.style.overflow = "";
      if (stage) stage.style.overflow = "";
      if (programColumn) programColumn.style.overflow = "";
      if (program) program.style.overflow = "";
    }
  };

  lockOverflow();

  const mq = window.matchMedia(NARROW_MQ);
  const onMq = () => lockOverflow();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", onMq);
  else mq.addListener(onMq);

  const onResize = () => lockOverflow();
  window.addEventListener("resize", onResize);

  // Program / preview capture (getDisplayMedia + getUserMedia), contained 16:9.
  const preview = program ? initPreview(program) : null;

  if (app && app.dataset) app.dataset.shellReady = "1";

  return {
    app,
    preview,
    teardown() {
      window.removeEventListener("resize", onResize);
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onMq);
      else mq.removeListener(onMq);
      if (preview && typeof preview.destroy === "function") preview.destroy();
    },
  };
}

const boot = initShell(document);
export default boot;
