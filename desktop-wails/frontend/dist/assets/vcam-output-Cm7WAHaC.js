const frame = document.getElementById("vcam-frame");
const waiting = document.getElementById("vcam-waiting");
window.maka.onVcamFrame((dataUrl) => {
  if (!dataUrl.startsWith("data:image/jpeg")) return;
  frame.src = dataUrl;
  frame.hidden = false;
  if (waiting) waiting.hidden = true;
});
