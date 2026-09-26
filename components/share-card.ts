const SIZE = 1080;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("empty card"))), "image/png");
  });
}

/** Square card: logo, the two aggregate counts, and PANE. No names or coursework. */
export async function renderShareCard(stats: { overdue: number; done: number }, logo: HTMLImageElement | null) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  ctx.fillStyle = "#eef3fb";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const blobs = [
    { x: 120, y: 80, r: 340, color: "rgba(201, 215, 255, 0.95)" },
    { x: 980, y: 160, r: 380, color: "rgba(224, 208, 255, 0.85)" },
    { x: 1000, y: 860, r: 300, color: "rgba(248, 208, 226, 0.75)" },
    { x: 80, y: 920, r: 280, color: "rgba(201, 243, 228, 0.85)" },
    { x: 540, y: 1040, r: 240, color: "rgba(255, 227, 196, 0.7)" },
  ];
  for (const spot of blobs) {
    const gradient = ctx.createRadialGradient(spot.x, spot.y, 20, spot.x, spot.y, spot.r);
    gradient.addColorStop(0, spot.color);
    gradient.addColorStop(1, "rgba(238, 243, 251, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.shadowColor = "rgba(51, 64, 128, 0.16)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, 100, 180, 880, 720, 72);
  ctx.fillStyle = "rgba(231, 238, 254, 0.92)";
  ctx.fill();
  ctx.restore();

  roundRect(ctx, 100, 180, 880, 720, 72);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 4;
  ctx.stroke();

  if (logo && logo.complete && logo.naturalWidth > 0) {
    const height = 132;
    const width = height * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, (SIZE - width) / 2, 250, width, height);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#5b6478";
  ctx.font = "600 28px Inter, sans-serif";
  ctx.fillText("THIS WEEK", SIZE / 2, 470);

  ctx.fillStyle = "#14213d";
  ctx.font = "600 72px Inter, sans-serif";
  ctx.fillText(String(stats.overdue), SIZE / 2, 590);
  ctx.font = "600 34px Inter, sans-serif";
  ctx.fillStyle = "#5b6478";
  ctx.fillText("overdue", SIZE / 2, 640);

  ctx.fillStyle = "#14213d";
  ctx.font = "600 72px Inter, sans-serif";
  ctx.fillText(String(stats.done), SIZE / 2, 760);
  ctx.font = "600 34px Inter, sans-serif";
  ctx.fillStyle = "#5b6478";
  ctx.fillText("done this week", SIZE / 2, 810);

  ctx.fillStyle = "#14213d";
  ctx.font = "600 22px Inter, sans-serif";
  ctx.fillText("PANE", SIZE / 2, 980);

  const png = await blob(canvas);
  return new File([png], "pane-week.png", { type: "image/png" });
}
