import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { paneInvitePath } from "../lib/pane-qr.ts";

test("a scanned Pane invite opens that account and ignores other codes", () => {
  assert.equal(paneInvitePath("AB12cd34"), "/invite/ab12cd34");
  assert.equal(paneInvitePath("https://pane.example/invite/ab12cd34"), "/invite/ab12cd34");
  assert.equal(paneInvitePath("https://pane.example/invite/ab12cd34/"), "/invite/ab12cd34");
  assert.equal(paneInvitePath("https://pane.example/invite/ab12cd34?ref=qr"), "/invite/ab12cd34");
  assert.equal(paneInvitePath("https://evil.example/invite/ab12cd34"), "/invite/ab12cd34");
  assert.equal(paneInvitePath("javascript:alert(1)"), null);
  assert.equal(paneInvitePath("https://pane.example/profile"), null);
  assert.equal(paneInvitePath("not a code"), null);
  assert.equal(paneInvitePath(""), null);
});

test("a Pane account QR decodes back to that invite", () => {
  const url = "https://educational-app.example/invite/ab12cd34";
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const scale = 4;
  const size = (qr.modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / scale) - quiet;
      const col = Math.floor(x / scale) - quiet;
      const dark = row >= 0 && col >= 0 && row < qr.modules.size && col < qr.modules.size && qr.modules.get(row, col);
      const index = (y * size + x) * 4;
      const value = dark ? 20 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const found = jsQR(data, size, size);
  assert.equal(found?.data, url);
  assert.equal(paneInvitePath(found?.data ?? ""), "/invite/ab12cd34");
});
