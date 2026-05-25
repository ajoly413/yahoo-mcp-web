import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Imap from "imap";
import { simpleParser } from "mailparser";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------------------
   IMAP CONNECTION
---------------------------- */
function connectIMAP() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.YAHOO_EMAIL,
      password: process.env.YAHOO_APP_PASSWORD,
      host: "imap.mail.yahoo.com",
      port: 993,
      tls: true
    });

    imap.once("ready", () => resolve(imap));
    imap.once("error", reject);
    imap.connect();
  });
}

/* ---------------------------
   MCP HANDSHAKE (REQUIRED)
---------------------------- */
app.get("/", (req, res) => {
  res.json({
    mcp: "1.0",
    tools: [
      {
        name: "list_emails",
        description: "List the most recent Yahoo emails"
      }
    ]
  });
});

/* ---------------------------
   MCP SSE ENDPOINT (REQUIRED)
---------------------------- */
app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`event: ready\n`);
  res.write(
    `data: ${JSON.stringify({
      tools: [
        { name: "list_emails", description: "List the most recent Yahoo emails" }
      ]
    })}\n\n`
  );

  req.on("close", () => res.end());
});

/* ---------------------------
   TOOL: LIST EMAILS
---------------------------- */
app.post("/tools/list_emails", async (req, res) => {
  try {
    const imap = await connectIMAP();

    imap.openBox("INBOX", true, (err, box) => {
      if (err) return res.json({ error: err.message });

      const fetch = imap.seq.fetch(`${box.messages.total - 10}:*`, {
        bodies: "HEADER.FIELDS (FROM SUBJECT DATE)"
      });

      const emails = [];

      fetch.on("message", (msg) => {
        let header = "";
        msg.on("body", (stream) => {
          stream.on("data", (chunk) => (header += chunk.toString()));
        });
        msg.once("end", () => {
          const parsed = Imap.parseHeader(header);
          emails.push({
            from: parsed.from?.[0] || "",
            subject: parsed.subject?.[0] || "",
            date: parsed.date?.[0] || ""
          });
        });
      });

      fetch.once("end", () => {
        imap.end();
        res.json({ emails });
      });
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

/* ---------------------------
   START SERVER
---------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Yahoo MCP running on port", PORT);
});