export default async function handler(req, res) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).send("Missing API key");
  }

  let offset = 0;
  const limit = 50;
  let totalFixed = 0;

  while (true) {
    const response = await fetch(
      `https://api.brevo.com/v3/contacts?limit=${limit}&offset=${offset}`,
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.log("Fetch error:", err);
      break;
    }

    const data = await response.json();
    const contacts = data.contacts;

    if (!contacts || contacts.length === 0) {
      break;
    }

    for (const contact of contacts) {
      const attrs = contact.attributes || {};
      const email = contact.email;

      let updatePayload = { attributes: {} };

      // ===== NAME SPLIT =====
      if (attrs.FULL_NAME && !attrs.FIRSTNAME) {
        const parts = attrs.FULL_NAME.trim().split(/\s+/);
        updatePayload.attributes.FIRSTNAME = parts.shift();
        updatePayload.attributes.LASTNAME = parts.join(" ") || "";
      }

      // ===== DATE FORMAT FIX =====
      if (attrs.DATE_CREATED && typeof attrs.DATE_CREATED === "string") {
        const parsed = new Date(attrs.DATE_CREATED);
        if (!isNaN(parsed)) {
          updatePayload.attributes.DATE_CREATED =
            parsed.toISOString().split("T")[0];
        }
      }

      // ===== UPDATE CONTACT IF NEEDED =====
      if (Object.keys(updatePayload.attributes).length > 0) {
        const updateResponse = await fetch(
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

        if (updateResponse.ok) {
          totalFixed++;
        } else {
          const err = await updateResponse.text();
          console.log("Update error:", err);
        }
      }
    }

    offset += limit;
  }

  return res.status(200).send(`Fixed ${totalFixed} contacts`);
}
