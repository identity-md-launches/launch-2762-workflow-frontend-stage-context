import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const art = readFileSync(
    new URL("../public/hamster.svg", import.meta.url),
    "utf8",
  );
  const font = readFileSync(
    new URL("../src/nunito-latin.woff2", import.meta.url),
  ).toString("base64");
  await p.setContent(
    `<style>@font-face{font-family:Nunito;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#191f2b;color:#f5f0e4;font-family:Nunito}main{padding:64px;width:1200px;height:630px;position:relative}h1{font-size:76px;font-weight:800;line-height:1.05;margin:56px 0 24px;max-width:670px;letter-spacing:-3px}p{font-size:26px;color:#adb7c9;margin:0}header{font-size:26px;color:#f3ce85}svg{position:absolute;right:20px;top:180px;width:450px;height:330px}.foot{position:absolute;bottom:50px;font-size:21px;color:#adb7c9}</style><main><header>Hamster Nap · NAP</header><h1>Last buy<br>before bedtime.</h1><p>A last-buyer game on Sepolia testnet.</p>${art}<p class="foot">Unofficial community game · Test tokens of no value</p></main>`,
  );
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({
    path: fileURLToPath(new URL("../public/share.png", import.meta.url)),
  });
  console.log(
    "Generated 1200 × 630 share.png from local illustration and font.",
  );
} finally {
  await b.close();
}
