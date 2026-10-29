// 録画用のメール受信口（実際には送信しない）。受信した内容を mail/ に保存する。

import fs from "node:fs";
import net from "node:net";

const dir = new URL("./mail/", import.meta.url).pathname;
let n = 0;
net
  .createServer((sock) => {
    let buf = "",
      data = false,
      body = "";
    const w = (s) => sock.write(s + "\r\n");
    w("220 demo-sink ESMTP");
    sock.on("data", (c) => {
      buf += c.toString("utf8");
      for (;;) {
        if (data) {
          const i = buf.indexOf("\r\n.\r\n");
          if (i < 0) {
            body += buf;
            buf = "";
            return;
          }
          body += buf.slice(0, i);
          buf = buf.slice(i + 5);
          data = false;
          n += 1;
          fs.writeFileSync(`${dir}${Date.now()}-${n}.eml`, body);
          body = "";
          w("250 OK queued");
          continue;
        }
        const j = buf.indexOf("\r\n");
        if (j < 0) {
          return;
        }
        const line = buf.slice(0, j);
        buf = buf.slice(j + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") {
          sock.write(
            "250-demo-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n"
          );
        } else if (cmd === "HELO") {
          w("250 demo-sink");
        } else if (cmd === "AUTH") {
          w("235 2.7.0 ok");
        } else if (cmd === "DATA") {
          data = true;
          w("354 go");
        } else if (cmd === "QUIT") {
          w("221 bye");
          sock.end();
        } else {
          w("250 OK");
        }
      }
    });
    sock.on("error", () => {});
  })
  .listen(2525, "127.0.0.1", () => console.log("smtp sink on 2525"));
