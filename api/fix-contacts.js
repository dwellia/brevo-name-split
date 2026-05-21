export default async function handler(req, res) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).send("Missing API key");

  const fetchLimit = 200;
  const maxUpdatesPerRun = 200;

  // Contacts created after this date get SOURCE_DATE copied from createdAt
  const CUTOFF_DATE = new Date("2026-05-22T00:00:00Z");

  let offset = 0;
  let totalProcessed = 0;
  let scanned = 0;

  const blockedDomains = ["booking.com", "vrbo.com", "airbnb.com"];

  while (totalProcessed < maxUpdatesPerRun) {
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
      if (totalProcessed >= maxUpdatesPerRun) break;

      scanned++;

      const attrs = contact.attributes || {};
      const email = contact.email;

      let updatePayload = { attributes: {} };
      let shouldDelete = false;

      // ===== REMOVE OTA EMAILS =====
      if (email) {
        const lowerEmail = email.toLowerCase();

        if (blockedDomains.some(domain => lowerEmail.includes(domain))) {

          if (!attrs.PHONE && !attrs.SMS) {
            shouldDelete = true;
          } else {
            updatePayload.email = null;
          }
        }
      }

      // ===== DELETE CONTACT IF REQUIRED =====
      if (shouldDelete) {
        await fetch(
          `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
          {
            method: "DELETE",
            headers: { "api-key": apiKey }
          }
        );

        totalProcessed++;
        continue;
      }

      // ===== COPY BREVO CREATION DATE TO SOURCE_DATE FOR NEW CONTACTS ONLY =====
      // Only applies to contacts created after the cutoff date (tomorrow onwards)
      // Old imported contacts without SOURCE_DATE are skipped intentionally
      if (!attrs.SOURCE_DATE && contact.createdAt) {
        const created = new Date(contact.createdAt);

        if (!isNaN(created) && created >= CUTOFF_DATE) {
          const year = created.getFullYear();
          const month = String(created.getMonth() + 1).padStart(2, "0");
          const day = String(created.getDate()).padStart(2, "0");

          updatePayload.attributes.SOURCE_DATE = `${year}-${month}-${day}`;
        }
      }

      // ===== NAME SPLIT =====
      if (attrs.FULL_NAME && !attrs.FIRSTNAME) {
        const parts = attrs.FULL_NAME.trim().split(/\s+/);
        updatePayload.attributes.FIRSTNAME = parts.shift();
        updatePayload.attributes.LASTNAME = parts.join(" ") || "";
      }

      // ===== FORCE SOURCE_DATE NORMALIZATION TO YYYY-MM-DD =====
      if (attrs.SOURCE_DATE) {
        const parsed = new Date(attrs.SOURCE_DATE);

        if (!isNaN(parsed)) {
          const year = parsed.getFullYear();
          const month = String(parsed.getMonth() + 1).padStart(2, "0");
          const day = String(parsed.getDate()).padStart(2, "0");

          const normalized = `${year}-${month}-${day}`;

          if (attrs.SOURCE_DATE !== normalized) {
            updatePayload.attributes.SOURCE_DATE = normalized;
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

      if (
        Object.keys(updatePayload.attributes).length > 0 ||
        updatePayload.email === null
      ) {
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

        totalProcessed++;
      }
    }

    offset += fetchLimit;
  }

  return res.status(200).send(
    `Scanned ${scanned} contacts. Processed ${totalProcessed}.`
  );
}
