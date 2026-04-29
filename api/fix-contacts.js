export default async function handler(req, res) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).send("Missing API key");

  const fetchLimit = 200;
  const maxUpdatesPerRun = 200;

  let offset = 0;
  let totalFixed = 0;
  let scanned = 0;

  while (totalFixed < maxUpdatesPerRun) {
    const response = await fetch(
      `https://api.brevo.com/v3/contacts?limit=${fetchLimit}&offset=${offset}`,
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) break;

    const data = await response.json();
    const contacts = data.contacts || [];

    if (contacts.length === 0) break;

    for (const contact of contacts) {
      if (totalFixed >= maxUpdatesPerRun) break;

      scanned++;

      const attrs = contact.attributes || {};
      const email = contact.email;

      let updatePayload = { attributes: {} };

      // ===== NAME SPLIT =====
      if (attrs.FULL_NAME && !attrs.FIRSTNAME) {
        const parts = attrs.FULL_NAME.trim().split(/\s+/);
        updatePayload.attributes.FIRSTNAME = parts.shift();
        updatePayload.attributes.LASTNAME = parts.join(" ") || "";
      }

      // ===== CHECKIN_DATE → DATE_CREATED =====
      if (attrs.CHECKIN_DATE) {
        const parsed = new Date(attrs.CHECKIN_DATE);
        if (!isNaN(parsed)) {
          updatePayload.attributes.DATE_CREATED =
            parsed.toISOString().split("T")[0];
        }
      }

     // ===== FORCE DATE NORMALIZATION TO YYYY-MM-DD =====
if (attrs.DATE_CREATED) {
  const parsed = new Date(attrs.DATE_CREATED);

  if (!isNaN(parsed)) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    const normalized = `${year}-${month}-${day}`;

    if (attrs.DATE_CREATED !== normalized) {
      updatePayload.attributes.DATE_CREATED = normalized;
    }
  }
}

      // ===== PHONE REMAP + NORMALIZE =====
      let rawPhone = attrs.PHONE || attrs.SMS;

      if (rawPhone) {
        let digits = rawPhone.replace(/\D/g, "");

        if (digits.length === 10) digits = "1" + digits;

        if (digits.length === 11 && digits.startsWith("1")) {
          const formatted =
            "1-" +
            digits.substring(1, 4) +
            "-" +
            digits.substring(4, 7) +
            "-" +
            digits.substring(7);

          if (attrs.PHONE !== formatted) {
            updatePayload.attributes.PHONE = formatted;
          }

          if (attrs.SMS) {
            updatePayload.attributes.SMS = "";
          }
        }
      }

      if (Object.keys(updatePayload.attributes).length > 0) {
        await fetch(
          `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
          {
            method: "PUT",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(updatePayload)
          }
        );

        totalFixed++;
      }
    }

    offset += fetchLimit;
  }

  return res.status(200).send(
    `Scanned ${scanned} contacts. Fixed ${totalFixed}.`
  );
}
