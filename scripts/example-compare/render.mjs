import sharp from 'sharp'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function imageCard(title, image, meta) {
  return `<figure><figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(
    meta,
  )}</span></figcaption><a href="${escapeHtml(image)}"><img src="${escapeHtml(
    image,
  )}" loading="lazy" /></a></figure>`
}

export function renderHtml(summary) {
  const sections = summary.items
    .map((item) => {
      const cards = [
        imageCard('original', item.files.original, item.input),
        imageCard(summary.before.label, item.files.before, item.before.grid),
        imageCard(summary.after.label, item.files.after, item.after.grid),
        imageCard('diff', item.files.diff, `${item.diff.changedPixels} px / MAE ${item.diff.mae}`),
      ].join('')
      return `<section><header><div><p>${escapeHtml(item.dataset)}</p><h2>${escapeHtml(
        item.file,
      )}</h2></div><span>${item.same ? 'same' : 'changed'}</span></header><div class="grid">${cards}</div></section>`
    })
    .join('')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>fast-pixelizer example comparison</title>
<style>
body{margin:0;background:#f7f7f4;color:#171717;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
main{width:min(1640px,calc(100vw - 32px));margin:0 auto;padding:28px 0 56px}
h1,h2,p,figure{margin:0}h1{font-size:28px}.meta{color:#666;font-size:13px;line-height:1.5}
.head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:22px}
section{border-top:1px solid #d8d8d2;padding:24px 0 30px}header{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:12px}
header p{color:#0f766e;font-size:12px;font-weight:700;text-transform:uppercase}h2{font-size:19px}header span{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#666}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{background:#fff;border:1px solid #d8d8d2;padding:10px}
figcaption{display:flex;justify-content:space-between;gap:10px;color:#666;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:7px}
img{display:block;width:100%;height:auto;image-rendering:pixelated;background:#eee;border:1px solid #d8d8d2}
@media(max-width:900px){.head,header{display:block}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){main{width:calc(100vw - 20px)}.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main><div class="head"><div><h1>fast-pixelizer example comparison</h1><p class="meta">${escapeHtml(
    summary.before.spec,
  )} -> ${escapeHtml(summary.after.spec)}</p></div><p class="meta">output: ${summary.output}<br />colorVariety: ${summary.colorVariety}<br />changed: ${summary.aggregate.changed}/${summary.aggregate.count}</p></div>${sections}</main></body>
</html>`
}

function xmlEscape(value) {
  return escapeHtml(value).replaceAll("'", '&apos;')
}

function labelSvg(title, meta, width, height) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="100%" height="100%" fill="#fff"/><text x="8" y="18" font-size="13" font-family="monospace" fill="#111">${xmlEscape(
    title,
  )}</text><text x="8" y="36" font-size="11" font-family="monospace" fill="#666">${xmlEscape(meta)}</text></svg>`)
}

async function thumbnail(file, width, height) {
  return sharp(file)
    .resize(width, height, { background: '#f0f0ed', fit: 'contain' })
    .png()
    .toBuffer()
}

export async function writeContactSheet(summary, file) {
  const tileW = 260
  const imageH = 190
  const labelH = 46
  const gap = 12
  const cols = 4
  const rowH = imageH + labelH + gap
  const width = cols * tileW + (cols + 1) * gap
  const height = summary.items.length * rowH + gap
  const composites = []

  for (let row = 0; row < summary.items.length; row++) {
    const item = summary.items[row]
    const top = gap + row * rowH
    const cells = [
      ['original', item.input, item.absFiles.original],
      [summary.before.label, item.before.grid, item.absFiles.before],
      [summary.after.label, item.after.grid, item.absFiles.after],
      ['diff', `${item.diff.changedPixels} px`, item.absFiles.diff],
    ]
    for (let col = 0; col < cells.length; col++) {
      const left = gap + col * (tileW + gap)
      composites.push({ input: labelSvg(cells[col][0], cells[col][1], tileW, labelH), left, top })
      composites.push({
        input: await thumbnail(cells[col][2], tileW, imageH),
        left,
        top: top + labelH,
      })
    }
  }

  await sharp({
    create: { background: '#f7f7f4', channels: 4, height, width },
  })
    .composite(composites)
    .png()
    .toFile(file)
}
