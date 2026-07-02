const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const GRAPH_BASE = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}`;

const authHeader = { Authorization: `Bearer ${ACCESS_TOKEN}` };

export async function sendMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/messages`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp API error ${res.status}: ${await res.text()}`);
  }
}

/**
 * Upload a file to WhatsApp's media store and return its media ID.
 * (WhatsApp requires media be uploaded first, then referenced when sending.)
 */
async function uploadMedia(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  const res = await fetch(`${GRAPH_BASE}/media`, {
    method: 'POST',
    headers: authHeader, // do NOT set Content-Type — fetch adds the multipart boundary
    body: form,
  });

  if (!res.ok) {
    throw new Error(`WhatsApp media upload error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Send a document (e.g. a PDF) to the user, with an optional caption. */
export async function sendDocument(
  to: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  const mediaId = await uploadMedia(buffer, filename, 'application/pdf');

  const res = await fetch(`${GRAPH_BASE}/messages`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: { id: mediaId, filename, caption },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp document send error ${res.status}: ${await res.text()}`);
  }
}
