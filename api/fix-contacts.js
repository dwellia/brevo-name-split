export default async function handler(req, res) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).send("Missing API key");

  const fetchLimit = 200;
  const maxUpdatesPerRun = 200;
  const PAST_GUEST_LIST_ID = 8;
  const TEMP_LIST_ID = 12;
  const DRIP_BATCH_SIZE = 50;

  // Contacts created after this date get SOURCE_DATE copied from createdAt
  const CUTOFF_DATE = new Date("2026-05-22T00:00:00Z");

  const blockedDomains = ["booking.com", "vrbo.com", "airbnb.com"];

  let offset = 0;
  let totalProcessed = 0;
  let scanned = 0;

  // ─────────────────────────────────────────────
  // PASS 1: Clean all contacts in the main list
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // PASS 2: Drip 50 clean contacts from list 12 → list 8
  // A contact is considered clean if it has been through
  // at least one daily run (SOURCE_DATE set or skipped intentionally,
  // name split done, phone normalized)
  // ─────────────────────────────────────────────
  let dripOffset = 0;
  let dripCount = 0;

  while (dripCount < DRIP_BATCH_SIZE) {
    const tempResponse = await fetch(
      `https://api.brevo.com/v3/contacts/lists/${TEMP_LIST_ID}/contacts/get?limit=${fetchLimit}&offset=${dripOffset}`,
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    if (!tempResponse.ok) break;

    const tempData = await tempResponse.json();
    const tempContacts = tempData.contacts || [];

    if (tempContacts.length === 0) break;

    for (const contact of tempContacts) {
      if (dripCount >= DRIP_BATCH_SIZE) break;

      const attrs = contact.attributes || {};

      // ===== CLEAN CHECK =====
      // Must have FIRSTNAME (name split has run)
      // Must not be an OTA email
      const email = contact.email || "";
      const isOTA = blockedDomains.some(d => email.toLowerCase().includes(d));
      const hasName = !!attrs.FIRSTNAME;

      if (!hasName || isOTA) continue;

      // ===== ADD TO PAST GUEST LIST =====
      await fetch(
        `https://api.brevo.com/v3/contacts/lists/${PAST_GUEST_LIST_ID}/contacts/add`,
        {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ emails: [contact.email] })
        }
      );

      // ===== REMOVE FROM TEMP LIST =====
      await fetch(
        `https://api.brevo.com/v3/contacts/lists/${TEMP_LIST_ID}/contacts/remove`,
        {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ emails: [contact.email] })
        }
      );

      dripCount++;
    }

    dripOffset += fetchLimit;
  }

  return res.status(200).send(
    `Scanned ${scanned} contacts. Processed ${totalProcessed}. Dripped ${dripCount} contacts from temp to Past Guest list.`
  );
}
